import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { LanguageProvider, LanguageSwitch } from "../app/language";

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
    };
    const { rerender } = render(<ChatPanel {...props} busy />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Checking your permitted sources");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(status.querySelector(".thinking-dots")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    rerender(<ChatPanel {...props} busy={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ChatPanel cache status", () => {
  const props = {
    documents: [],
    name: "Sam",
    departments: ["operations" as const],
    messages: [
      {
        question: "Question",
        response: {
          answer: "Answer",
          citations: [],
          cache_status: "hit" as const,
        },
      },
    ],
    busy: false,
    signedIn: true,
    onNew: () => {},
    onOpen: () => {},
  };

  it("shows an accessible badge only for an explicit cache hit", () => {
    const { rerender } = render(<ChatPanel {...props} />);
    const badge = screen.getByRole("status", { name: "Cached Hit" });
    expect(badge).toBeVisible();
    expect(badge.closest(".assistant-message")).toContainElement(
      screen.getByText("Answer"),
    );
    expect(
      within(badge.closest<HTMLElement>(".answer-status")!).getByText(
        "Result unavailable",
      ),
    ).toBeVisible();

    rerender(
      <ChatPanel
        {...props}
        messages={[
          {
            ...props.messages[0],
            response: {
              ...props.messages[0].response,
              cache_status: "miss" as const,
            },
          },
        ]}
      />,
    );
    expect(screen.queryByText("Cached Hit")).not.toBeInTheDocument();
  });

  it("translates the cache badge to Traditional Chinese", () => {
    render(
      <LanguageProvider>
        <>
          <LanguageSwitch />
          <ChatPanel {...props} />
        </>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "CH" }));
    expect(screen.getByRole("status", { name: "快取命中" })).toBeVisible();
  });
});
