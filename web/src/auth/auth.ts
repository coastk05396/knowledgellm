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
  sessionStorage.setItem("knowledge-account-switch", "1");
  redirect(logoutUrl(appConfig));
}
