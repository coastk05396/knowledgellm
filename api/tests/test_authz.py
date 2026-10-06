from knowledgellm.authz import departments_for_claims


def test_department_groups_are_allowlisted_and_claims_must_be_well_formed() -> None:
    assert departments_for_claims({"cognito:groups": ["finance", "admin"]}) == frozenset({"finance"})
    assert departments_for_claims({"cognito:groups": '["operations"]'}) == frozenset({"operations"})
    assert departments_for_claims({}) == frozenset()
    assert departments_for_claims({"cognito:groups": "finance,operations"}) == frozenset({"finance", "operations"})
    assert departments_for_claims({"cognito:groups": "[finance]"}) == frozenset({"finance"})
    assert departments_for_claims({"cognito:groups": "hacker,admin"}) == frozenset()
    assert departments_for_claims({"cognito:groups": '["finance", 3]'}) == frozenset()
