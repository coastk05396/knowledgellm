import json
from collections.abc import Mapping

ALLOWED_DEPARTMENTS = frozenset({"finance", "operations", "people"})


def departments_for_claims(claims: Mapping[str, object]) -> frozenset[str]:
    """Return only configured department names from API Gateway-verified claims."""
    raw_groups = claims.get("cognito:groups")
    if isinstance(raw_groups, str):
        try:
            parsed = json.loads(raw_groups)
            if isinstance(parsed, list):
                raw_groups = parsed
            else:
                raw_groups = [str(parsed)]
        except json.JSONDecodeError:
            # API Gateway HTTP API v2 JWT authorizer often maps array claims as '[finance]' or 'finance,operations'
            clean = raw_groups.strip("[] \t\r\n")
            raw_groups = [g.strip(" \t'\"") for g in clean.replace(",", " ").split() if g.strip()]
    if not isinstance(raw_groups, list) or not all(isinstance(group, str) for group in raw_groups):
        return frozenset()
    return frozenset(group for group in raw_groups if group in ALLOWED_DEPARTMENTS)
