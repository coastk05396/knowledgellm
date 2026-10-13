import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_API_URL } from "./src/app/apiEndpoint";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const apiProxy = {
    "/api": {
      target: env.VITE_API_URL || DEFAULT_API_URL,
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
