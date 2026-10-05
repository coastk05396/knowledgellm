def handler(event: dict[str, object], context: object) -> dict[str, object]:
    del event, context
    return {"statusCode": 200, "headers": {"content-type": "application/json"}, "body": '{"status":"ok"}'}
