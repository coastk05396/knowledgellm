import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
describe("KnowledgeLLM shell", () => {
  it("shows the product title and account sign-in prompt", async () => {
    render(<App />);
    expect(
      screen.getByRole("link", { name: "KnowledgeLLM home" }),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
