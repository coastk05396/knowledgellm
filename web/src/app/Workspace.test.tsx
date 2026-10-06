import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./App";
import type { DocumentSummary } from "./api";

const session = { accessToken: "access", name: "Alex Morgan" };
afterEach(() => vi.unstubAllGlobals());
describe("Authorized knowledge workspace", () => {
  it.each([
    ["finance", "Alex", "Finance"],
    ["operations", "Sam", "Operations"],
    ["people", "Priya", "People"],
  ] as const)(
    "verifies %s only after the API confirms access and unlocks that folder",
    async (department, name, label) => {
      let resolveDocuments!: (docs: DocumentSummary[]) => void;
      const documents = new Promise<DocumentSummary[]>((resolve) => {
        resolveDocuments = resolve;
      });
      const { container } = render(
        <Workspace
          session={{ accessToken: "access", name }}
          onSwitch={async () => {}}
          api={{
            loadDocuments: () => documents,
            askQuestion: async () => ({ answer: "", citations: [] }),
            openDocument: async () => "https://docs.example.com/source.md",
          }}
        />,
      );
      expect(
        screen.queryByText("AWS Cognito Verified"),
      ).not.toBeInTheDocument();
      expect(
        container.querySelectorAll(".folders .lucide-lock-keyhole"),
      ).toHaveLength(3);

      resolveDocuments([
        { id: "source", title: "Permitted source", department },
      ]);
      expect(
        await screen.findByRole("button", { name: "Permitted source" }),
      ).toBeVisible();
      const identity = screen.getByRole("button", {
        name: `Sign in as another account: ${name}, ${label}`,
      });
      expect(within(identity).getByText("AWS Cognito Verified")).toBeVisible();
      expect(screen.getAllByText("AWS Cognito Verified")).toHaveLength(1);
      const folder = screen.getByRole("button", { name: `${label} / ${name}` });
      expect(folder).toBeEnabled();
      expect(folder).toHaveAttribute("aria-expanded", "true");
      expect(folder.querySelector(".lucide-lock-keyhole")).toBeNull();
      expect(
        container.querySelectorAll(".folders .lucide-lock-keyhole"),
      ).toHaveLength(2);

      fireEvent.click(identity);
      expect(
        screen.queryByText("AWS Cognito Verified"),
      ).not.toBeInTheDocument();
      expect(
        container.querySelectorAll(".folders .lucide-lock-keyhole"),
      ).toHaveLength(3);
    },
  );
  it("keeps the mobile identity and status copy aligned with the reference", async () => {
    render(
      <Workspace
        session={session}
        onSwitch={async () => {}}
        api={{
          loadDocuments: async () => [
            {
              id: "finance-q4",
              title: "Q4 budget overview",
              department: "finance",
            },
          ],
          askQuestion: async () => ({ answer: "", citations: [] }),
          openDocument: async () => "https://docs.example.com/source.md",
        }}
      />,
    );
    expect(
      await screen.findByText(
        "Answers use only Finance files Alex can access.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Tap to switch")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Sign in as another account: Alex, Finance",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("only displays documents received from the authorized API", async () => {
    render(
      <Workspace
        session={session}
        onSwitch={async () => {}}
        api={{
          loadDocuments: async () => [
            {
              id: "finance-q4",
              title: "Q4 budget overview",
              department: "finance",
            },
          ],
          askQuestion: async () => ({ answer: "", citations: [] }),
          openDocument: async () => "https://docs.example.com/source.md",
        }}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Q4 budget overview" }),
    ).toBeVisible();
    expect(screen.queryByText("Employee handbook")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Operations.*restricted/i }),
    ).toBeDisabled();
  });
  it("sends questions, displays cited answers, and clears the conversation", async () => {
    let submitted = "";
    let opened = "";
    vi.stubGlobal("open", () => ({
      opener: null,
      location: { replace: vi.fn() },
      close: vi.fn(),
    }));
    render(
      <Workspace
        session={session}
        onSwitch={async () => {}}
        api={{
          loadDocuments: async () => [
            {
              id: "finance-q4",
              title: "Q4 budget overview",
              department: "finance",
            },
          ],
          askQuestion: async (_token, question) => {
            submitted = question;
            return {
              answer: "Vendor costs changed.",
              citations: [
                { document_id: "finance-q4", title: "Q4 budget overview" },
              ],
            };
          },
          openDocument: async (_token, id) => {
            opened = id;
            return "https://docs.example.com/source.md";
          },
        }}
      />,
    );
    await screen.findByRole("button", { name: "Q4 budget overview" });
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByText("Vendor costs changed.")).toBeVisible();
    expect(submitted).toBe("What changed?");
    fireEvent.click(
      screen.getByRole("button", { name: "Source: Q4 budget overview" }),
    );
    await waitFor(() => expect(opened).toBe("finance-q4"));
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("Vendor costs changed.")).not.toBeInTheDocument();
  });
  it("keeps service failures safe and disables asking when document access fails", async () => {
    render(
      <Workspace
        session={session}
        onSwitch={async () => {}}
        api={{
          loadDocuments: async () => {
            throw new Error("secret provider detail");
          },
          askQuestion: async () => ({ answer: "", citations: [] }),
          openDocument: async () => "https://docs.example.com/source.md",
        }}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Documents are unavailable",
    );
    expect(
      screen.queryByText("secret provider detail"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Your question" }),
    ).toBeDisabled();
    expect(screen.queryByText("AWS Cognito Verified")).not.toBeInTheDocument();
  });
});

it("clears protected content immediately when account switching begins", async () => {
  let switchStarted = false;
  render(
    <Workspace
      session={session}
      onSwitch={async () => {
        switchStarted = true;
      }}
      api={{
        loadDocuments: async () => [
          {
            id: "finance-q4",
            title: "Q4 budget overview",
            department: "finance",
          },
        ],
        askQuestion: async () => ({ answer: "", citations: [] }),
        openDocument: async () => "https://docs.example.com/source.md",
      }}
    />,
  );
  await screen.findByRole("button", { name: "Q4 budget overview" });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Sign in as another account: Sam, Operations",
    }),
  );
  expect(switchStarted).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Q4 budget overview" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Your question" })).toBeDisabled();
});
it("displays source and provider failures without rendering internal details", async () => {
  vi.stubGlobal("open", () => ({
    opener: null,
    location: { replace: vi.fn() },
    close: vi.fn(),
  }));
  render(
    <Workspace
      session={session}
      onSwitch={async () => {}}
      api={{
        loadDocuments: async () => [
          {
            id: "finance-q4",
            title: "Q4 budget overview",
            department: "finance",
          },
        ],
        askQuestion: async () => {
          throw new Error("private provider input");
        },
        openDocument: async () => {
          throw new Error("private storage key");
        },
      }}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Q4 budget overview" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "source could not be opened",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
    target: { value: "What changed?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An answer is unavailable",
    ),
  );
  expect(
    screen.queryByText(/private provider|private storage/),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Your question" })).toHaveValue(
    "What changed?",
  );
});
it("rejects answers whose citations are outside the authorized listing", async () => {
  render(
    <Workspace
      session={session}
      onSwitch={async () => {}}
      api={{
        loadDocuments: async () => [
          {
            id: "finance-q4",
            title: "Q4 budget overview",
            department: "finance",
          },
        ],
        askQuestion: async () => ({
          answer: "Restricted answer",
          citations: [
            { document_id: "people-handbook", title: "Employee handbook" },
          ],
        }),
        openDocument: async () => "https://docs.example.com/source.md",
      }}
    />,
  );
  await screen.findByRole("button", { name: "Q4 budget overview" });
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
    target: { value: "What changed?" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Your question" }), {
    key: "Enter",
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "An answer is unavailable",
  );
  expect(screen.queryByText("Restricted answer")).not.toBeInTheDocument();
  expect(screen.queryByText("Employee handbook")).not.toBeInTheDocument();
});

it("opens a citation in a separate tab so the active conversation stays open", async () => {
  const sourceWindow = {
    opener: window,
    location: { replace: vi.fn() },
    close: vi.fn(),
  };
  const open = vi.fn(() => sourceWindow as unknown as Window);
  vi.stubGlobal("open", open);
  render(
    <Workspace
      session={session}
      onSwitch={async () => {}}
      api={{
        loadDocuments: async () => [
          {
            id: "finance-q4",
            title: "Q4 budget overview",
            department: "finance",
          },
        ],
        askQuestion: async () => ({
          answer: "Vendor costs changed.",
          citations: [
            { document_id: "finance-q4", title: "Q4 budget overview" },
          ],
        }),
        openDocument: async () =>
          "https://docs.example.com/finance/q4-budget-overview.md",
      }}
    />,
  );
  await screen.findByRole("button", { name: "Q4 budget overview" });
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
    target: { value: "What changed?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
  expect(await screen.findByText("Vendor costs changed.")).toBeVisible();

  fireEvent.click(
    screen.getByRole("button", { name: "Source: Q4 budget overview" }),
  );

  await waitFor(() =>
    expect(sourceWindow.location.replace).toHaveBeenCalledWith(
      "https://docs.example.com/finance/q4-budget-overview.md",
    ),
  );
  expect(open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(sourceWindow.opener).toBeNull();
  expect(screen.getByText("Vendor costs changed.")).toBeVisible();
});
