from knowledgellm.authz import departments_for_claims


def test_department_groups_are_allowlisted_and_claims_must_be_well_formed() -> None:
    assert departments_for_claims({"cognito:groups": ["finance", "admin"]}) == frozenset({"finance"})
    assert departments_for_claims({"cognito:groups": '["operations"]'}) == frozenset({"operations"})
    assert departments_for_claims({}) == frozenset()
    assert departments_for_claims({"cognito:groups": "finance,operations"}) == frozenset()
    assert departments_for_claims({"cognito:groups": '["finance", 3]'}) == frozenset()
