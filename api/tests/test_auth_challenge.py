import pytest

from knowledgellm.auth_challenge import handler


def event(source="DefineAuthChallenge_Authentication", username="alex", **request):
    return {"triggerSource": source, "userName": username, "request": {"session": [], **request},
            "response": {}}


@pytest.mark.parametrize("username", ["alex", "sam", "priya"])
def test_all_demo_personas_complete_the_cognito_challenge(monkeypatch, username):
    monkeypatch.setenv("DEMO_MODE", "true")
    defined = handler(event(username=username), None)["response"]
    assert defined == {"issueTokens": False, "failAuthentication": False,
                       "challengeName": "CUSTOM_CHALLENGE"}
    created = handler(event("CreateAuthChallenge_Authentication", username,
                            challengeName="CUSTOM_CHALLENGE"), None)["response"]
    assert created["publicChallengeParameters"] == {"mode": "demo"}
    verified = handler(event("VerifyAuthChallengeResponse_Authentication", username,
                             privateChallengeParameters=created["privateChallengeParameters"],
                             challengeAnswer="demo"), None)["response"]
    assert verified == {"answerCorrect": True}
    issued = handler(event(username=username, session=[{"challengeName": "CUSTOM_CHALLENGE",
                            "challengeResult": True, "challengeMetadata": "DEMO_PERSONA"}]), None)["response"]
    assert issued == {"issueTokens": True, "failAuthentication": False}


@pytest.mark.parametrize("flag", [None, "false", "TRUE", ""])
def test_disabled_demo_never_issues_tokens_or_accepts_answers(monkeypatch, flag):
    if flag is None:
        monkeypatch.delenv("DEMO_MODE", raising=False)
    else:
        monkeypatch.setenv("DEMO_MODE", flag)
    assert handler(event(), None)["response"] == {"issueTokens": False, "failAuthentication": True}
    assert handler(event("VerifyAuthChallengeResponse_Authentication", challengeAnswer="demo",
                         privateChallengeParameters={"mode": "demo"}), None)["response"] == {"answerCorrect": False}
    with pytest.raises(ValueError):
        handler(event("CreateAuthChallenge_Authentication", challengeName="CUSTOM_CHALLENGE"), None)


@pytest.mark.parametrize("username", ["hacker", "Alex", "", None, []])
def test_only_whitelisted_usernames_are_accepted(monkeypatch, username):
    monkeypatch.setenv("DEMO_MODE", "true")
    assert handler(event(username=username), None)["response"]["failAuthentication"] is True
    assert handler(event("VerifyAuthChallengeResponse_Authentication", username,
                         privateChallengeParameters={"mode": "demo"}, challengeAnswer="demo"), None)["response"]["answerCorrect"] is False


def test_unknown_users_fail_closed(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    assert handler(event(userNotFound=True), None)["response"]["failAuthentication"] is True


@pytest.mark.parametrize("session", [None, "bad", [{}], ["bad"],
    [{"challengeName": "CUSTOM_CHALLENGE", "challengeResult": False, "challengeMetadata": "DEMO_PERSONA"}],
    [{"challengeName": "PASSWORD_VERIFIER", "challengeResult": True, "challengeMetadata": "DEMO_PERSONA"}],
    [{"challengeName": "CUSTOM_CHALLENGE", "challengeResult": True, "challengeMetadata": "wrong"}],
    [{"challengeName": "CUSTOM_CHALLENGE", "challengeResult": True, "challengeMetadata": "DEMO_PERSONA"}] * 2])
def test_failed_or_unexpected_sessions_never_issue_tokens(monkeypatch, session):
    monkeypatch.setenv("DEMO_MODE", "true")
    assert handler(event(session=session), None)["response"] == {"issueTokens": False, "failAuthentication": True}


@pytest.mark.parametrize("parameters,answer", [(None, "demo"), ({}, "demo"), ({"mode": "wrong"}, "demo"),
                                             ({"mode": "demo"}, "wrong"), ({"mode": "demo"}, None)])
def test_invalid_answers_fail_closed(monkeypatch, parameters, answer):
    monkeypatch.setenv("DEMO_MODE", "true")
    response = handler(event("VerifyAuthChallengeResponse_Authentication",
                            privateChallengeParameters=parameters, challengeAnswer=answer), None)
    assert response["response"] == {"answerCorrect": False}


def test_malformed_events_fail_closed(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    for request in [None, [], "bad"]:
        with pytest.raises(ValueError):
            handler({"request": request}, None)
    with pytest.raises(ValueError):
        handler(event("unknown"), None)
