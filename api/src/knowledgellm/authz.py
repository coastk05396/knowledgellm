import json
from collections.abc import Mapping

ALLOWED_DEPARTMENTS = frozenset({"finance", "operations", "people"})


def departments_for_claims(claims: Mapping[str, object]) -> frozenset[str]:
    """Return only configured department names from API Gateway-verified claims."""
    raw_groups = claims.get("cognito:groups")
    if isinstance(raw_groups, str):
        try:
            raw_groups = json.loads(raw_groups)
        except json.JSONDecodeError:
            return frozenset()
    if not isinstance(raw_groups, list) or not all(isinstance(group, str) for group in raw_groups):
        return frozenset()
    return frozenset(group for group in raw_groups if group in ALLOWED_DEPARTMENTS)
