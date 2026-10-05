from collections.abc import Mapping

from knowledgellm.authz import ALLOWED_DEPARTMENTS


def department_filter(departments: frozenset[str]) -> dict[str, object]:
    authorized = sorted(departments & ALLOWED_DEPARTMENTS)
    if len(authorized) == 1:
        match: Mapping[str, object] = {"value": authorized[0]}
    elif authorized:
        match = {"any": authorized}
    else:
        match = {"value": "__no_authorized_department__"}
    return {"must": [{"key": "department", "match": dict(match)}]}
