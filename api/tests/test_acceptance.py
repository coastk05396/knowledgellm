import json

import pytest

from knowledgellm.handler import handler


@pytest.mark.parametrize(
    ("department", "expected_titles"),
    [
        ("finance", {"Q4 budget overview", "Expense policy"}),
        ("operations", {"Runbook & procedures", "Service handoff"}),
        ("people", {"Employee handbook", "Leave policy"}),
    ],
)
def test_each_identity_receives_only_its_two_sample_documents(
    department: str, expected_titles: set[str]
) -> None:
    response = handler(
        {
            "rawPath": "/documents",
            "queryStringParameters": {"department": "people" if department != "people" else "finance"},
            "requestContext": {
                "http": {"method": "GET"},
                "authorizer": {"jwt": {"claims": {"cognito:groups": f'["{department}"]'}}},
            },
        },
        object(),
    )

    documents = json.loads(response["body"])["documents"]
    assert response["statusCode"] == 200
    assert {document["title"] for document in documents} == expected_titles
    assert {document["department"] for document in documents} == {department}
