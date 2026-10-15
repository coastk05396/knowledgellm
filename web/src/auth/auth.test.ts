import { afterEach, describe, expect, it, vi } from "vitest";
import { User } from "oidc-client-ts";
import {
  createAuthSettings,
  logoutUrl,
  userManager,
  signIn,
  signInAsPersona,
  switchIdentity,
} from "./auth";

vi.mock("../app/config", () => ({
  authConfigured: true,
  appConfig: {
    apiUrl: "https://api.example.com",
    cognitoDomain: "https://login.example.com",
    cognitoIssuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool",
    cognitoClientId: "client",
    redirectUri: "https://app.example.com/",
  },
}));
const config = {
  apiUrl: "https://api.example.com",
  cognitoDomain: "https://login.example.com",
  cognitoIssuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool",
  cognitoClientId: "client",
  redirectUri: "https://app.example.com/",
};
describe("Cognito authentication", () => {
  it("requires authorization code with PKCE and session-scoped token storage", () => {
    const settings = createAuthSettings(config);
    expect(settings.response_type).toBe("code");
    expect(settings.disablePKCE).toBe(false);
    expect(settings.scope).toBe("openid profile email");
    expect(settings.metadata?.authorization_endpoint).toBe(
      "https://login.example.com/oauth2/authorize",
    );
  });
  it("returns to the application through Cognito logout", () => {
    const url = new URL(logoutUrl(config));
    expect(url.pathname).toBe("/logout");
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(url.searchParams.get("logout_uri")).toBe("https://app.example.com/");
  });
  it("forces fresh credentials for every managed sign-in", async () => {
    const redirect = vi
      .spyOn(userManager!, "signinRedirect")
      .mockResolvedValue();
    await signIn();
    expect(redirect).toHaveBeenCalledWith({ prompt: "login" });
    redirect.mockRestore();
  });
  it("removes stored access tokens before Cognito logout", async () => {
    await userManager!.storeUser(
      new User({
        access_token: "session-token",
        token_type: "Bearer",
        profile: {
          sub: "alex",
          iss: config.cognitoIssuer,
          aud: "client",
          iat: 0,
          exp: 9999999999,
        },
        expires_at: 9999999999,
      }),
    );
    expect((await userManager!.getUser())?.access_token).toBe("session-token");
    let destination = "";
    await switchIdentity((url) => {
      destination = url;
      expect(Object.values(sessionStorage).join(" ")).not.toContain(
        "session-token",
      );
    });
    expect(destination).toBe(
      "https://login.example.com/logout?client_id=client&logout_uri=https%3A%2F%2Fapp.example.com%2F",
    );
    expect(await userManager!.getUser()).toBeNull();
    expect(sessionStorage.getItem("knowledge-account-switch")).toBe("1");
    sessionStorage.removeItem("knowledge-account-switch");
  });
});

describe("password-free Cognito demo authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sessionStorage.clear();
  });
  it.each([
    ["finance", "alex", "Alex Morgan"],
    ["operations", "sam", "Sam Patel"],
    ["people", "priya", "Priya Ray"],
  ])(
    "completes %s custom authentication without a password",
    async (department, username, name) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ChallengeName: "CUSTOM_CHALLENGE",
            Session: "mock-challenge-session",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            AuthenticationResult: {
              AccessToken: "mock-access-token",
              ExpiresIn: 3600,
            },
          }),
        });
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const session = await signInAsPersona(department);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const first = fetchMock.mock.calls[0];
      const second = fetchMock.mock.calls[1];
      expect(first[0]).toBe("https://cognito-idp.us-east-1.amazonaws.com/");
      expect(first[1].headers["X-Amz-Target"]).toBe(
        "AWSCognitoIdentityProviderService.InitiateAuth",
      );
      expect(JSON.parse(first[1].body)).toEqual({
        AuthFlow: "CUSTOM_AUTH",
        ClientId: "client",
        AuthParameters: { USERNAME: username },
      });
      expect(second[1].headers["X-Amz-Target"]).toBe(
        "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
      );
      expect(JSON.parse(second[1].body)).toEqual({
        ChallengeName: "CUSTOM_CHALLENGE",
        ClientId: "client",
        Session: "mock-challenge-session",
        ChallengeResponses: { USERNAME: username, ANSWER: "demo" },
      });
      expect(session).toEqual({
        accessToken: "mock-access-token",
        name,
        expiresAt: 3601000,
      });
      expect(
        JSON.parse(sessionStorage.getItem("knowledge-direct-session")!),
      ).toEqual(session);
      expect(first[1].body).not.toContain("PASSWORD");
    },
  );
  it.each(["hacker", "constructor", "__proto__"])(
    "rejects unknown persona %s before fetching",
    async (persona) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(signInAsPersona(persona)).rejects.toThrow("Unknown");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("clears the previous persona if Cognito rejects authentication", async () => {
    sessionStorage.setItem("knowledge-direct-session", "old-session");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(signInAsPersona("finance")).rejects.toThrow("unavailable");
    expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
  });
  it.each([
    null,
    {},
    { ChallengeName: "PASSWORD_VERIFIER", Session: "session" },
    { ChallengeName: "CUSTOM_CHALLENGE" },
  ])("rejects unexpected Cognito challenges", async (data) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetchMock);
    await expect(signInAsPersona("finance")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
  });
  it("does not save an incomplete challenge response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ChallengeName: "CUSTOM_CHALLENGE",
            Session: "session",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ChallengeName: "CUSTOM_CHALLENGE" }),
        }),
    );
    await expect(signInAsPersona("finance")).rejects.toThrow("No access token");
    expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
  });
  it.each([undefined, 0, -1, "3600", null, Infinity])(
    "rejects invalid Cognito expiry %s",
    async (expiresIn) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              ChallengeName: "CUSTOM_CHALLENGE",
              Session: "session",
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              AuthenticationResult: {
                AccessToken: "token",
                ExpiresIn: expiresIn,
              },
            }),
          }),
      );
      await expect(signInAsPersona("finance")).rejects.toThrow("expiry");
      expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
    },
  );
});
