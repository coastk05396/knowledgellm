import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  try {
    if (window[name]) continue;
  } catch {
    // Storage can be unavailable in opaque test origins.
  }
  Object.defineProperty(window, name, {
    configurable: true,
    value: createMemoryStorage(),
  });
}

afterEach(cleanup);
