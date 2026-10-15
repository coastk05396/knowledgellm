"""Shared, fail-closed quota for valid chat requests across Lambda instances."""
import hashlib
import os
import time
from collections.abc import Callable
from functools import lru_cache
from typing import Any

from botocore.exceptions import ClientError

from knowledgellm.request_budget import require_time

WINDOW_SECONDS = 60
REQUEST_LIMIT = 10


class QuotaExceeded(Exception):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__("chat quota exceeded")


class DynamoChatQuota:
    def __init__(self, table_name: str, client: Any, clock: Callable[[], float] = time.time) -> None:
        self.table_name = table_name
        self.client = client
        self.clock = clock

    def consume(self, subject: str) -> None:
        require_time(3)
        now = int(self.clock())
        window = now // WINDOW_SECONDS
        expires_at = (window + 1) * WINDOW_SECONDS
        identity = hashlib.sha256(subject.encode()).hexdigest()
        try:
            # The condition and increment are one atomic operation. Windowed keys
            # keep delayed DynamoDB TTL deletion from blocking the next minute.
            self.client.update_item(
                TableName=self.table_name,
                Key={"pk": {"S": f"chat#{identity}#{window}"}},
                UpdateExpression="SET expires_at = :expiry ADD #count :one",
                ConditionExpression="attribute_not_exists(#count) OR #count < :limit",
                ExpressionAttributeNames={"#count": "request_count"},
                ExpressionAttributeValues={
                    ":expiry": {"N": str(expires_at)}, ":one": {"N": "1"},
                    ":limit": {"N": str(REQUEST_LIMIT)},
                },
            )
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise QuotaExceeded(expires_at - now) from None
            raise


@lru_cache(maxsize=1)
def create_chat_quota() -> DynamoChatQuota:
    table_name = os.getenv("CHAT_QUOTA_TABLE", "").strip()
    if not table_name:
        raise RuntimeError("chat quota is not configured")
    import boto3
    from botocore.config import Config

    # A retry after an ambiguous write could charge a request twice. Fail closed
    # and reserve enough time for a safe HTTP error instead.
    client = boto3.client("dynamodb", config=Config(
        connect_timeout=1, read_timeout=1,
        retries={"total_max_attempts": 1, "mode": "standard"},
    ))
    return DynamoChatQuota(table_name, client)
