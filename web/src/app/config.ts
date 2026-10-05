export interface AppConfig {
  apiUrl: string;
  cognitoDomain: string;
  cognitoIssuer: string;
  cognitoClientId: string;
  redirectUri: string;
}
const env = (
  import.meta as ImportMeta & { env: Record<string, string | undefined> }
).env;
export const appConfig: AppConfig = {
  apiUrl: env.VITE_API_URL ?? "",
  cognitoDomain: (env.VITE_COGNITO_DOMAIN ?? "").replace(/\/$/, ""),
  cognitoIssuer: env.VITE_COGNITO_ISSUER ?? "",
  cognitoClientId: env.VITE_COGNITO_CLIENT_ID ?? "",
  redirectUri: env.VITE_REDIRECT_URI ?? window.location.origin + "/",
};
export const authConfigured = Boolean(
  appConfig.cognitoDomain &&
  appConfig.cognitoIssuer &&
  appConfig.cognitoClientId,
);
