import {
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from "oidc-client-ts";
import { appConfig, authConfigured, type AppConfig } from "../app/config";
export interface Session {
  accessToken: string;
  name: string;
  expiresAt?: number;
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
const DEMO_PERSONAS: Record<string, { username: string; name: string }> = {
  finance: { username: "alex", name: "Alex Morgan" },
  operations: { username: "sam", name: "Sam Patel" },
  people: { username: "priya", name: "Priya Ray" },
};

interface CognitoAuthResponse {
  ChallengeName?: string;
  Session?: string;
  AuthenticationResult?: { AccessToken?: string; ExpiresIn?: number };
}

async function cognitoAuth(
  action: "InitiateAuth" | "RespondToAuthChallenge",
  payload: Record<string, unknown>,
): Promise<CognitoAuthResponse> {
  const region = appConfig.cognitoIssuer.match(
    /^https:\/\/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com\//,
  )?.[1];
  if (!region) throw new Error("Invalid Cognito configuration.");
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Demo sign-in is unavailable.");
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null)
    throw new Error("Invalid Cognito response.");
  return data as CognitoAuthResponse;
}

export async function signInAsPersona(department: string): Promise<Session> {
  sessionStorage.removeItem("knowledge-direct-session");
  const persona = Object.hasOwn(DEMO_PERSONAS, department)
    ? DEMO_PERSONAS[department]
    : undefined;
  if (!persona) throw new Error("Unknown demo persona.");
  const challenge = await cognitoAuth("InitiateAuth", {
    AuthFlow: "CUSTOM_AUTH",
    ClientId: appConfig.cognitoClientId,
    AuthParameters: { USERNAME: persona.username },
  });
  if (
    challenge.ChallengeName !== "CUSTOM_CHALLENGE" ||
    typeof challenge.Session !== "string" ||
    !challenge.Session
  ) {
    throw new Error("Invalid Cognito challenge.");
  }
  const result = await cognitoAuth("RespondToAuthChallenge", {
    ChallengeName: "CUSTOM_CHALLENGE",
    ClientId: appConfig.cognitoClientId,
    Session: challenge.Session,
    // Public demo acknowledgement, not a password or proof of identity.
    ChallengeResponses: { USERNAME: persona.username, ANSWER: "demo" },
  });
  const token = result.AuthenticationResult?.AccessToken;
  if (typeof token !== "string" || !token)
    throw new Error("No access token returned from Cognito.");
  const expiresIn = result.AuthenticationResult?.ExpiresIn;
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  )
    throw new Error("No valid token expiry returned from Cognito.");
  const expiresAt = Date.now() + expiresIn * 1000;
  if (!Number.isSafeInteger(expiresAt))
    throw new Error("Invalid token expiry returned from Cognito.");
  const session: Session = {
    accessToken: token,
    name: persona.name,
    expiresAt,
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
