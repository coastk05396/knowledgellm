import { defineConfig, devices } from "@playwright/test";

const live = process.env.E2E_LIVE_AUTH === "1";
const suppliedUrl = process.env.E2E_BASE_URL;
if (live && !suppliedUrl) {
  throw new Error("Live authentication checks require E2E_BASE_URL.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: live ? "**/*.live.spec.ts" : "**/*.offline.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: suppliedUrl || "http://127.0.0.1:5180",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: suppliedUrl
    ? undefined
    : {
        command:
          "rtk proxy npm exec vite -- --host 127.0.0.1 --port 5180 --strictPort",
        wait: { stdout: /http:\/\/127\.0\.0\.1:5180/ },
        reuseExistingServer: false,
        env: {
          VITE_COGNITO_ISSUER:
            "https://cognito-idp.ap-southeast-1.amazonaws.com/offline-test",
          VITE_COGNITO_CLIENT_ID: "offline-test-client",
        },
      },
});
