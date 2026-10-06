import os
from collections.abc import Mapping
from functools import lru_cache
from typing import Protocol


class SecretsClient(Protocol):
    def get_secret_value(self, SecretId: str) -> Mapping[str, str]: ...


@lru_cache(maxsize=16)
def _aws_secret(secret_arn: str) -> str:
    import boto3

    return _secret_string(boto3.client("secretsmanager"), secret_arn)


def _secret_string(client: SecretsClient, secret_arn: str) -> str:
    value = client.get_secret_value(SecretId=secret_arn).get("SecretString")
    if not isinstance(value, str) or not value:
        raise RuntimeError("configured provider secret is empty or invalid")
    return value


def read_secret(
    local_env_name: str,
    secret_arn_env_name: str,
    environ: Mapping[str, str] = os.environ,
    client: SecretsClient | None = None,
) -> str:
    local_value = environ.get(local_env_name)
    if local_value:
        return local_value
    secret_arn = environ.get(secret_arn_env_name)
    if not secret_arn:
        raise RuntimeError("provider secret is not configured")
    if client is not None:
        return _secret_string(client, secret_arn)
    return _aws_secret(secret_arn)
