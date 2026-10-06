import { DEFAULT_API_URL } from "./apiEndpoint";

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
  apiUrl: env.DEV ? "/api" : env.VITE_API_URL || DEFAULT_API_URL,
  cognitoDomain: (
    env.VITE_COGNITO_DOMAIN ||
    "https://rick-knowledgellm-demo.auth.ap-southeast-1.amazoncognito.com"
  ).replace(/\/$/, ""),
  cognitoIssuer:
    env.VITE_COGNITO_ISSUER ||
    "https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_5aSsCjK0K",
  cognitoClientId: env.VITE_COGNITO_CLIENT_ID || "25kol0lmnr3kdk71tt60qrjv0u",
  redirectUri:
    env.VITE_REDIRECT_URI ||
    (typeof window !== "undefined"
      ? window.location.origin + "/"
      : "http://localhost:5173/"),
};
export const authConfigured = Boolean(
  appConfig.cognitoDomain &&
  appConfig.cognitoIssuer &&
  appConfig.cognitoClientId,
);
