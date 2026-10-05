import { describe, expect, it, vi } from "vitest";
import { User } from "oidc-client-ts";
import {
  createAuthSettings,
  logoutUrl,
  userManager,
  signIn,
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
