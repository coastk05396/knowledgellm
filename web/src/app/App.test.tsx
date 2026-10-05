import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("KnowledgeLLM shell", () => {
  it("shows the product title and account sign-in prompt", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "KnowledgeLLM" })).toBeVisible();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
