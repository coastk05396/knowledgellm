import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
describe("KnowledgeLLM shell", () => {
  it("offers persona sign-in without a separate credential prompt", async () => {
    render(<App />);
    expect(
      screen.getByRole("link", { name: "KnowledgeLLM home" }),
    ).toBeVisible();
    for (const name of [
      "Sign in as another account: Alex, Finance",
      "Sign in as another account: Sam, Operations",
      "Sign in as another account: Priya, People",
    ]) {
      const identity = screen.getByRole("button", { name });
      expect(identity).toBeVisible();
      await waitFor(() => expect(identity).toBeEnabled());
    }
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Use your Cognito username and password."),
    ).not.toBeInTheDocument();
  });
});
