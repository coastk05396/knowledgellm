import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

const { expiredHandlers } = vi.hoisted(() => ({
  expiredHandlers: new Set<() => void>(),
}));
vi.mock("./auth", () => ({
  userManager: {
    events: {
      addAccessTokenExpired: (handler: () => void) =>
        expiredHandlers.add(handler),
      removeAccessTokenExpired: (handler: () => void) =>
        expiredHandlers.delete(handler),
    },
    getUser: async () => ({
      access_token: "oidc",
      expired: false,
      profile: { name: "Managed User" },
    }),
  },
  signIn: vi.fn(),
  switchIdentity: vi.fn(),
  signInAsPersona: async () => ({
    accessToken: "direct",
    name: "Alex Morgan",
    expiresAt: Date.now() + 3600000,
  }),
}));
function Probe() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.session?.name ?? "Signed out"}</p>
      <button onClick={() => void auth.loginAsPersona("finance")}>Alex</button>
    </>
  );
}
afterEach(() => {
  sessionStorage.clear();
});
it("keeps OIDC expiration events scoped to the managed session", async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  expect(screen.getByText("Managed User")).toBeInTheDocument();
  act(() => {
    expiredHandlers.forEach((handler) => handler());
  });
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Alex" }));
  });
  act(() => {
    expiredHandlers.forEach((handler) => handler());
  });
  expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
});
