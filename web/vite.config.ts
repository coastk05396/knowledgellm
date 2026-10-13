import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_API_URL } from "./src/app/apiEndpoint";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const configuredApiUrl = env.VITE_API_URL || DEFAULT_API_URL;
  const proxyTarget =
    env.VITE_API_PROXY_TARGET ||
    (configuredApiUrl.startsWith("/") ? DEFAULT_API_URL : configuredApiUrl);
  const apiProxy = {
    "/api": {
      target: proxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
    },
  };
  return {
    plugins: [react()],
    server: {
      proxy: apiProxy,
    },
    preview: { proxy: apiProxy },
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      environmentOptions: { jsdom: { url: "http://localhost/" } },
      setupFiles: "./src/test/setup.ts",
    },
  };
});
