"""Cognito custom challenge triggers for public, fictional demo personas."""
import os
from collections.abc import Mapping

PERSONAS = frozenset({"alex", "sam", "priya"})
METADATA = "DEMO_PERSONA"


def handler(event: dict[str, object], context: object) -> dict[str, object]:
    request = event.get("request")
    if not isinstance(request, Mapping):
        raise ValueError("Invalid authentication request")
    username = event.get("userName")
    enabled = (
        os.environ.get("DEMO_MODE") == "true"
        and isinstance(username, str) and username in PERSONAS
        and request.get("userNotFound") is not True
    )
    source = event.get("triggerSource")
    response: dict[str, object]
    if source == "DefineAuthChallenge_Authentication":
        response = {"issueTokens": False, "failAuthentication": True}
        session = request.get("session")
        if enabled and isinstance(session, list):
            if not session:
                response = {"issueTokens": False, "failAuthentication": False,
                            "challengeName": "CUSTOM_CHALLENGE"}
            elif len(session) == 1 and isinstance(session[0], Mapping):
                previous = session[0]
                if (previous.get("challengeName") == "CUSTOM_CHALLENGE"
                        and previous.get("challengeResult") is True
                        and previous.get("challengeMetadata") == METADATA):
                    response = {"issueTokens": True, "failAuthentication": False}
    elif source == "CreateAuthChallenge_Authentication":
        if not enabled or request.get("challengeName") != "CUSTOM_CHALLENGE":
            raise ValueError("Demo authentication unavailable")
        response = {"publicChallengeParameters": {"mode": "demo"},
                    "privateChallengeParameters": {"mode": "demo"},
                    "challengeMetadata": METADATA}
    elif source == "VerifyAuthChallengeResponse_Authentication":
        parameters = request.get("privateChallengeParameters")
        response = {"answerCorrect": bool(enabled and isinstance(parameters, Mapping)
                    and parameters.get("mode") == "demo"
                    and request.get("challengeAnswer") == "demo")}
    else:
        raise ValueError("Unsupported authentication trigger")
    # Do not log the event: it contains Cognito user attributes and session details.
    event["response"] = response
    return event
