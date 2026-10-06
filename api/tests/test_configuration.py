from collections.abc import Mapping

from knowledgellm.configuration import read_secret


class FakeSecretsClient:
    def __init__(self, value: str) -> None:
        self.value = value
        self.requested_arns: list[str] = []

    def get_secret_value(self, SecretId: str) -> Mapping[str, str]:
        self.requested_arns.append(SecretId)
        return {"SecretString": self.value}


def test_local_environment_secret_avoids_cloud_call() -> None:
    client = FakeSecretsClient("unused")

    assert read_secret("QDRANT_API_KEY", "QDRANT_API_KEY_SECRET_ARN", {"QDRANT_API_KEY": "local"}, client) == "local"
    assert client.requested_arns == []


def test_deployed_secret_is_read_by_arn_without_returning_arn_as_secret() -> None:
    client = FakeSecretsClient("provider-key")

    value = read_secret(
        "GROQ_API_KEY", "GROQ_API_KEY_SECRET_ARN", {"GROQ_API_KEY_SECRET_ARN": "arn:aws:secretsmanager:region:acct:secret:key"}, client
    )

    assert value == "provider-key"
    assert client.requested_arns == ["arn:aws:secretsmanager:region:acct:secret:key"]
