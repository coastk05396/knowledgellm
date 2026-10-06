import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
import { signInAsPersona, type Session } from "./auth";

vi.mock("./auth", () => ({
  userManager: null,
  signIn: vi.fn(),
  switchIdentity: vi.fn(),
  signInAsPersona: vi.fn(),
}));

function AuthProbe() {
  const auth = useAuth();
  return (
    <>
      <button onClick={() => void auth.loginAsPersona("finance")}>Alex</button>
      <button onClick={() => void auth.loginAsPersona("operations")}>
        Sam
      </button>
      <p>{auth.session?.name ?? "Signed out"}</p>
      {auth.toast && <p>{auth.toast.subtitle}</p>}
      {auth.error && <p role="alert">{auth.error}</p>}
    </>
  );
}

it("clears the previous identity before switching and never claims folder access from login alone", async () => {
  let rejectLogin!: (error: Error) => void;
  vi.mocked(signInAsPersona)
    .mockResolvedValueOnce({ accessToken: "access", name: "Alex Morgan" })
    .mockImplementationOnce(
      () =>
        new Promise<Session>((_resolve, reject) => {
          rejectLogin = reject;
        }),
    );
  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Alex" }));
  expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
  expect(screen.getByText("AWS Cognito Verified")).toBeInTheDocument();
  expect(screen.queryByText(/folder unlocked/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sam" }));
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(screen.queryByText("AWS Cognito Verified")).not.toBeInTheDocument();
  rejectLogin(new Error("internal provider detail"));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(
    screen.queryByText("internal provider detail"),
  ).not.toBeInTheDocument();
});
