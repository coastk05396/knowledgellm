from pathlib import Path


def test_each_department_has_two_synthetic_markdown_documents() -> None:
    samples = Path(__file__).parents[1] / "src" / "knowledgellm" / "sample_docs"

    assert {
        department.name: sorted(path.stem for path in department.glob("*.md"))
        for department in samples.iterdir()
        if department.is_dir()
    } == {
        "finance": ["expense-policy", "q4-budget-overview"],
        "operations": ["runbook-procedures", "service-handoff"],
        "people": ["employee-handbook", "leave-policy"],
    }
    assert all("fictional sample" in path.read_text().lower() for path in samples.glob("*/*.md"))
