import {
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from "oidc-client-ts";
import { appConfig, authConfigured, type AppConfig } from "../app/config";
export interface Session {
  accessToken: string;
  name: string;
}
export function createAuthSettings(config: AppConfig): UserManagerSettings {
  return {
    authority: config.cognitoIssuer,
    client_id: config.cognitoClientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    disablePKCE: false,
    scope: "openid profile email",
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    metadata: {
      issuer: config.cognitoIssuer,
      authorization_endpoint: config.cognitoDomain + "/oauth2/authorize",
      token_endpoint: config.cognitoDomain + "/oauth2/token",
      userinfo_endpoint: config.cognitoDomain + "/oauth2/userInfo",
      jwks_uri: config.cognitoIssuer + "/.well-known/jwks.json",
    },
  };
}
export function logoutUrl(config: AppConfig): string {
  const url = new URL(config.cognitoDomain + "/logout");
  url.searchParams.set("client_id", config.cognitoClientId);
  url.searchParams.set("logout_uri", config.redirectUri);
  return url.href;
}
export const userManager = authConfigured
  ? new UserManager(createAuthSettings(appConfig))
  : null;
export const DEMO_ACCOUNTS: Record<string, { username: string; name: string; password: string }> = {
  finance: { username: "alex", name: "Alex Morgan", password: "Demo123456!@#" },
  operations: { username: "sam", name: "Sam Patel", password: "Demo123456!@#" },
  people: { username: "priya", name: "Priya Ray", password: "Demo123456!@#" },
};

export async function signInAsPersona(department: string): Promise<Session> {
  const account = DEMO_ACCOUNTS[department];
  if (!account) throw new Error(`Unknown persona department: ${department}`);

  // Call Cognito directly with USER_PASSWORD_AUTH using the cognito-idp endpoint
  const regionMatch = appConfig.cognitoIssuer.match(/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/);
  const region = regionMatch ? regionMatch[1] : "ap-southeast-1";
  const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  const res = await fetch(cognitoEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: appConfig.cognitoClientId,
      AuthParameters: {
        USERNAME: account.username,
        PASSWORD: account.password,
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Cognito authentication failed: ${errorBody}`);
  }

  const data = await res.json();
  const token = data.AuthenticationResult?.AccessToken;
  if (!token) throw new Error("No access token returned from Cognito");

  const session: Session = {
    accessToken: token,
    name: account.name,
  };
  sessionStorage.setItem("knowledge-direct-session", JSON.stringify(session));
  return session;
}

export async function signIn(): Promise<void> {
  if (!userManager) throw new Error("Authentication is not configured.");
  await userManager.signinRedirect({ prompt: "login" });
}
export async function switchIdentity(
  redirect: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  if (!userManager) throw new Error("Authentication is not configured.");
  await userManager.removeUser();
  await userManager.clearStaleState();
  sessionStorage.removeItem("knowledge-direct-session");
  sessionStorage.setItem("knowledge-account-switch", "1");
  redirect(logoutUrl(appConfig));
}

