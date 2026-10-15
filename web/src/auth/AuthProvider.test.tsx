import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
import { signInAsPersona, type Session } from "./auth";

vi.mock("./auth", () => ({
  userManager: null,
  signIn: vi.fn(),
  switchIdentity: vi.fn(),
  signInAsPersona: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  sessionStorage.clear();
});
function AuthProbe() {
  const auth = useAuth();
  return (
    <>
      <button onClick={() => void auth.loginAsPersona("finance")}>Alex</button>
      <button onClick={() => void auth.loginAsPersona("operations")}>
        Sam
      </button>
      <button onClick={() => void auth.switchAccount()}>Switch account</button>
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

const savedSession = {
  accessToken: "access",
  name: "Alex Morgan",
  expiresAt: 10000,
};
async function restore(stored = JSON.stringify(savedSession)) {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  sessionStorage.setItem("knowledge-direct-session", stored);
  const view = render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}
it.each([
  "",
  "broken",
  "null",
  "{}",
  JSON.stringify({ accessToken: "token", name: "Alex" }),
  JSON.stringify({ ...savedSession, expiresAt: 999 }),
  JSON.stringify({ ...savedSession, expiresAt: "future" }),
  JSON.stringify({ ...savedSession, accessToken: "" }),
])("discards invalid or expired direct storage: %s", async (stored) => {
  await restore(stored);
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
});
it("restores a valid direct session and clears it at expiry", async () => {
  await restore();
  expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(9000);
  });
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("session expired");
  expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
});
it.each(["focus", "visibilitychange"])(
  "rechecks expiry on %s after sleep",
  async (event) => {
    await restore();
    act(() => {
      vi.setSystemTime(20000);
      fireEvent(event === "focus" ? window : document, new Event(event));
    });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(sessionStorage.getItem("knowledge-direct-session")).toBeNull();
  },
);
it("replaces old persona timers and clears login toast at expiry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.mocked(signInAsPersona)
    .mockResolvedValueOnce(savedSession)
    .mockResolvedValueOnce({
      ...savedSession,
      name: "Sam Patel",
      expiresAt: 20000,
    });
  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Alex" }));
  });
  expect(screen.getByText("AWS Cognito Verified")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sam" }));
  });
  await act(async () => {
    vi.advanceTimersByTime(9000);
  });
  expect(screen.getByText("Sam Patel")).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(screen.queryByText("AWS Cognito Verified")).not.toBeInTheDocument();
});
it("cancels expiry after unmount", async () => {
  const view = await restore();
  view.unmount();
  act(() => {
    vi.advanceTimersByTime(20000);
    fireEvent.focus(window);
  });
  expect(sessionStorage.getItem("knowledge-direct-session")).not.toBeNull();
});

it("cancels the direct expiry timer on account switching", async () => {
  await restore();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
  });
  await act(async () => {
    vi.advanceTimersByTime(20000);
  });
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument();
});
