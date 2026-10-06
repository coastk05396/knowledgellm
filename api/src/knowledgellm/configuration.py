import json
import os
from collections.abc import Mapping
from functools import lru_cache
from typing import Any, Protocol


class SecretsClient(Protocol):
    def get_secret_value(self, SecretId: str) -> Mapping[str, str]: ...


class SSMClient(Protocol):
    def get_parameter(self, Name: str, WithDecryption: bool = True) -> Mapping[str, Any]: ...


def _is_ssm(identifier: str) -> bool:
    return identifier.startswith("arn:aws:ssm:") or identifier.startswith("/")


@lru_cache(maxsize=16)
def _aws_secret(identifier: str) -> str:
    import boto3

    if _is_ssm(identifier):
        client = boto3.client("ssm")
        response = client.get_parameter(Name=identifier, WithDecryption=True)
        param = response.get("Parameter", {})
        value = param.get("Value")
        if not isinstance(value, str) or not value:
            raise RuntimeError("configured provider SSM parameter is empty or invalid")
        return value

    return _secret_string(boto3.client("secretsmanager"), identifier)


def _secret_string(client: SecretsClient, secret_arn: str) -> str:
    value = client.get_secret_value(SecretId=secret_arn).get("SecretString")
    if not isinstance(value, str) or not value:
        raise RuntimeError("configured provider secret is empty or invalid")
    return value


def _extract_key_if_json(raw_value: str, preferred_key: str) -> str:
    stripped = raw_value.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            data = json.loads(stripped)
            if isinstance(data, dict):
                lower_key = preferred_key.lower()
                for k, v in data.items():
                    if k.lower() in (lower_key, "api_key", "value"):
                        return str(v)
        except Exception:
            pass
    return raw_value


def read_secret(
    local_env_name: str,
    secret_arn_env_name: str,
    environ: Mapping[str, str] = os.environ,
    client: Any | None = None,
) -> str:
    local_value = environ.get(local_env_name)
    if local_value:
        return _extract_key_if_json(local_value, local_env_name)
    identifier = environ.get(secret_arn_env_name)
    if not identifier:
        raise RuntimeError("provider secret is not configured")
    if client is not None:
        if _is_ssm(identifier) and hasattr(client, "get_parameter"):
            response = client.get_parameter(Name=identifier, WithDecryption=True)
            param = response.get("Parameter", {})
            value = param.get("Value")
            if not isinstance(value, str) or not value:
                raise RuntimeError("configured provider SSM parameter is empty or invalid")
            return _extract_key_if_json(value, local_env_name)
        value = _secret_string(client, identifier)
        return _extract_key_if_json(value, local_env_name)
    raw = _aws_secret(identifier)
    return _extract_key_if_json(raw, local_env_name)
