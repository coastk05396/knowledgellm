import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatPanel } from "./ChatPanel";

describe("ChatPanel pending status", () => {
  it("announces a stable status while pending and clears it when finished", () => {
    const props = {
      documents: [],
      name: "Sam",
      departments: ["operations" as const],
      messages: [],
      signedIn: true,
      onNew: () => {},
      onOpen: () => {},
      onSuggestion: () => {},
    };
    const { rerender } = render(<ChatPanel {...props} busy />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Checking your permitted sources");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(status.querySelector(".thinking-dots")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByRole("button", {
        name: "How quickly must a P1 incident be acknowledged?",
      }),
    ).toBeDisabled();

    rerender(<ChatPanel {...props} busy={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How quickly must a P1 incident be acknowledged?",
      }),
    ).toBeEnabled();
  });
});
