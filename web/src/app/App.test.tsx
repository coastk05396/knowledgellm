import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
describe("KnowledgeLLM shell", () => {
  it("shows the product title and account sign-in prompt", () => {
    render(<App />);
    expect(
      screen.getByRole("link", { name: "KnowledgeLLM home" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
