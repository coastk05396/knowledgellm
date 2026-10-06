#!/usr/bin/env python3
"""Opt-in live answer/citation/cache evaluation; never print protected content.

Requires API_URL and FINANCE_TOKEN/OPERATIONS_TOKEN/PEOPLE_TOKEN in environment.
Uses existing tokens only. No login tokens, answers, or questions enter output.
"""
import argparse
import json
import os
import re
from pathlib import Path
from time import perf_counter
from urllib.request import Request, urlopen

EXPECTED = {
    "finance-01": "finance-q4-budget-overview",
    "finance-02": "finance-q4-budget-overview",
    **{f"finance-{i:02d}": "finance-expense-policy" for i in range(3, 6)},
    **{f"operations-{i:02d}": "operations-runbook-procedures" for i in range(1, 4)},
    **{f"operations-{i:02d}": "operations-service-handoff" for i in range(4, 6)},
    "people-01": "people-leave-policy",
    "people-02": "people-leave-policy",
    "people-03": "people-employee-handbook",
    "people-04": "people-employee-handbook",
    "people-05": "people-leave-policy",
}


FACTS = {
    "finance-01": [r"108[,. ]?000"],
    "finance-02": [r"3[,. ]?200", r"4[,. ]?500", r"Q1"],
    "finance-03": [r"economy", r"business", r"(?:VP|vice president)", r"approv"],
    "finance-04": [r"200"],
    "finance-05": [r"14", r"calendar"],
    "operations-01": [r"10", r"minut"],
    "operations-02": [r"30", r"minut"],
    "operations-03": [r"primary", r"secondary", r"coordinator", r"(?:engineering|engineer).*lead"],
    "operations-04": [r"ticket", r"health", r"deploy", r"maintenance", r"contact"],
    "operations-05": [r"Tuesday", r"Thursday", r"0?2[:.]00", r"0?4[:.]00", r"UTC"],
    "people-01": [r"20", r"day"],
    "people-02": [r"5", r"(?:first quarter|Q1)"],
    "people-03": [r"1[,. ]?000"],
    "people-04": [r"500"],
    "people-05": [r"16", r"6", r"week"],
}


def validate_repeat(result: dict, question_id: str) -> None:
    usage = result.get("usage")
    if (result.get("cache_status") != "hit" or result.get("cost_usd") != 0
            or not isinstance(usage, dict) or usage.get("input_tokens") != 0
            or usage.get("output_tokens") != 0):
        raise SystemExit(f"Repeat cache/cost check failed for {question_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Permit paid live API requests")
    args = parser.parse_args()
    catalog_path = Path(__file__).resolve().parents[1] / "api/src/knowledgellm/demo_questions.json"
    questions = json.loads(catalog_path.read_text())
    if len(questions) != 15 or {row["id"] for row in questions} != set(EXPECTED):
        raise SystemExit("The evaluation matrix must cover all 15 catalog IDs")
    if not args.execute:
        print(json.dumps({"mode": "dry_run", "questions": len(questions), "requests": 45}))
        return
    endpoint = os.environ["API_URL"].rstrip("/") + "/chat"
    if not endpoint.startswith("https://"):
        raise SystemExit("Live evaluation requires HTTPS")
    departments = ("finance", "operations", "people")
    tokens = {department: os.environ[f"{department.upper()}_TOKEN"] for department in departments}

    def ask(question: str, department: str) -> tuple[dict, float]:
        request = Request(endpoint, data=json.dumps({"question": question}).encode(),
                          headers={"Authorization": f"Bearer {tokens[department]}",
                                   "Content-Type": "application/json"})
        start = perf_counter()
        with urlopen(request, timeout=35) as response:
            result = json.load(response)
        return result, (perf_counter() - start) * 1000

    hits = 0
    for row in questions:
        first, first_ms = ask(row["question"], row["department"])
        second, second_ms = ask(row["question"], row["department"])
        for result in (first, second):
            if any(not re.search(pattern, result["answer"], re.IGNORECASE)
                   for pattern in FACTS[row["id"]]):
                raise SystemExit(f"Answer fact check needs human review for {row['id']}")
            ids = [citation["document_id"] for citation in result["citations"]]
            if EXPECTED[row["id"]] not in ids or any(not id_.startswith(row["department"] + "-") for id_ in ids):
                raise SystemExit(f"Supporting/authorized citation check failed for {row['id']}")
            if result.get("guardrail_action") not in ("pass", "source_pii_redacted"):
                raise SystemExit(f"Guardrail check failed for {row['id']}")
        validate_repeat(second, row["id"])
        hits += 1
        other = departments[(departments.index(row["department"]) + 1) % len(departments)]
        restricted, _ = ask(row["question"], other)
        if any(not citation["document_id"].startswith(other + "-") for citation in restricted["citations"]):
            raise SystemExit(f"Cross-department citation check failed for {row['id']}")
        if restricted.get("cache_status") == "hit":
            raise SystemExit(f"Cross-department catalog match failed for {row['id']}")
        print(json.dumps({"question_id": row["id"], "first_ms": round(first_ms, 1),
                          "repeat_ms": round(second_ms, 1), "repeat_cache_status": "hit",
                          "citations_scoped": True}))
    print(json.dumps({"repeat_requests": len(questions), "repeat_hits": hits,
                      "repeat_hit_rate": hits / len(questions)}))


if __name__ == "__main__":
    main()
