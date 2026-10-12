import {
  act,
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
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
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
      expect(screen.queryByText("Unlocked")).not.toBeInTheDocument();

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
      const folder = screen.getByRole("button", {
        name: `${label} / ${name} — Unlocked`,
      });
      expect(folder).toBeEnabled();
      expect(folder).toHaveAttribute("aria-expanded", "true");
      expect(folder.querySelector(".lucide-lock-keyhole")).toBeNull();
      expect(within(folder).getByText("Unlocked")).toBeVisible();
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
      expect(screen.queryByText("Unlocked")).not.toBeInTheDocument();
    },
  );
  it("keeps the mobile identity and status copy aligned with the reference", async () => {
    const { container } = render(
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
      await screen.findByRole("button", {
        name: "What is the total approved Q4 budget?",
      }),
    ).toBeVisible();
    expect(screen.getByText("Tap to switch")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Sign in as another account: Alex, Finance",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    const composer = container.querySelector(".composer-wrap")!;
    const monitor = container.querySelector(".mobile-monitor")!;
    expect(
      composer.compareDocumentPosition(monitor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
  it("does not show an unlocked owner when the authorized listing fails", async () => {
    render(
      <Workspace
        session={session}
        onSwitch={async () => {}}
        api={{
          loadDocuments: async () => {
            throw new Error("unavailable");
          },
          askQuestion: async () => ({ answer: "", citations: [] }),
          openDocument: async () => "https://docs.example.com/source.md",
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.queryByText("Unlocked")).not.toBeInTheDocument();
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

it("retains session cost after a response without an estimate and resets on new chat", async () => {
  const askQuestion = vi
    .fn()
    .mockResolvedValueOnce({
      answer: "Budget answer",
      citations: [],
      cost_usd: 0.0012,
    })
    .mockResolvedValueOnce({
      answer: "Remove personal details",
      citations: [],
    });
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
        askQuestion,
        openDocument: async () => "https://docs.example.com/source.md",
      }}
    />,
  );
  await screen.findByRole("button", { name: "Q4 budget overview" });
  for (const [question, answer] of [
    ["Budget?", "Budget answer"],
    ["Private details", "Remove personal details"],
  ]) {
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
      target: { value: question },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByText(answer);
    expect(screen.getAllByText("$0.0012 est.")).toHaveLength(2);
  }
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.queryByText("$0.0012 est.")).not.toBeInTheDocument();
});

it("switches to Traditional Chinese and sends the language without changing access", async () => {
  const askQuestion = vi.fn(async () => ({
    answer: "核准預算為一百萬元。",
    citations: [],
  }));
  const { unmount } = render(
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
        askQuestion,
        openDocument: async () => "https://docs.example.com/source-ch.md",
      }}
    />,
  );
  await screen.findByRole("button", { name: "Q4 budget overview" });
  fireEvent.click(screen.getByRole("button", { name: "CH" }));
  expect(document.documentElement.lang).toBe("zh-TW");
  expect(screen.getByRole("button", { name: "CH" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await screen.findByRole("button", { name: "第四季預算概覽" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /營運.*受限/ })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "第四季核准的總預算是多少？" }),
  );
  expect(screen.getByRole("textbox", { name: "您的問題" })).toHaveValue(
    "第四季核准的總預算是多少？",
  );
  fireEvent.click(screen.getByRole("button", { name: "傳送問題" }));
  await screen.findByText("核准預算為一百萬元。");
  expect(askQuestion).toHaveBeenCalledWith(
    "access",
    "第四季核准的總預算是多少？",
    "zh-TW",
  );
  unmount();
  render(<Workspace session={null} onSwitch={async () => {}} />);
  expect(screen.getByRole("button", { name: "CH" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "以其他帳號登入：Alex，財務" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  expect(document.documentElement.lang).toBe("en");
  expect(
    screen.getByRole("button", {
      name: "Sign in as another account: Alex, Finance",
    }),
  ).toBeVisible();
  window.localStorage.clear();
});

it("reloads source language and ignores outdated lists while retaining the conversation", async () => {
  let resolveChinese!: (docs: DocumentSummary[]) => void;
  const chineseDocuments = new Promise<DocumentSummary[]>((resolve) => {
    resolveChinese = resolve;
  });
  const api = {
    loadDocuments: vi.fn(async (_token: string, language = "en") =>
      language === "zh-TW"
        ? chineseDocuments
        : [
            {
              id: "finance-q4",
              title: "Q4 budget overview",
              department: "finance" as const,
            },
          ],
    ),
    askQuestion: async () => ({ answer: "Existing answer", citations: [] }),
    openDocument: async () => "https://docs.example.com/source.md",
  };
  render(<Workspace session={session} onSwitch={async () => {}} api={api} />);
  await screen.findByRole("button", { name: "Q4 budget overview" });
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
    target: { value: "Budget?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
  await screen.findByText("Existing answer");
  fireEvent.click(screen.getByRole("button", { name: "CH" }));
  expect(screen.getByText("Existing answer")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "您的問題" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  await screen.findByRole("button", { name: "Q4 budget overview" });
  await act(async () => {
    resolveChinese([
      { id: "stale", title: "Stale Chinese source", department: "finance" },
    ]);
  });
  expect(screen.queryByText("Stale Chinese source")).not.toBeInTheDocument();
  expect(screen.getByText("Existing answer")).toBeVisible();
  expect(api.loadDocuments.mock.calls.map((call) => call[1])).toEqual([
    "en",
    "zh-TW",
    "en",
  ]);
});

it("closes a pending source and ignores its URL when the language changes", async () => {
  let resolveUrl!: (url: string) => void;
  const sourceWindow = {
    opener: window,
    closed: false,
    location: { replace: vi.fn() },
    close: vi.fn(),
  };
  vi.stubGlobal("open", () => sourceWindow);
  const openDocument = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveUrl = resolve;
      }),
  );
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
        openDocument,
      }}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Q4 budget overview" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "CH" }));
  await screen.findByRole("button", { name: "第四季預算概覽" });
  await act(async () => {
    resolveUrl("https://docs.example.com/source.md");
  });
  expect(sourceWindow.close).toHaveBeenCalled();
  expect(sourceWindow.location.replace).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "第四季預算概覽" }));
  expect(openDocument).toHaveBeenLastCalledWith(
    "access",
    "finance-q4",
    "zh-TW",
  );
});

it("uses the current document locale for a Chinese answer's citation when switching to English", async () => {
  window.localStorage.setItem("knowledge-language", "zh-TW");
  const sourceWindow = {
    opener: window,
    location: { replace: vi.fn() },
    close: vi.fn(),
  };
  vi.stubGlobal("open", () => sourceWindow);
  const openDocument = vi.fn(
    async () => "https://docs.example.com/finance/q4-budget-overview.md",
  );
  render(
    <Workspace
      session={session}
      onSwitch={async () => {}}
      api={{
        loadDocuments: async (_token, language) => [
          {
            id: "finance-q4",
            title:
              language === "zh-TW" ? "第四季預算概覽" : "Q4 budget overview",
            department: "finance",
          },
        ],
        askQuestion: async () => ({
          answer: "核准預算為一百萬元。",
          citations: [{ document_id: "finance-q4", title: "第四季預算概覽" }],
        }),
        openDocument,
      }}
    />,
  );
  await screen.findByRole("button", { name: "第四季預算概覽" });
  fireEvent.change(screen.getByRole("textbox", { name: "您的問題" }), {
    target: { value: "核准預算是多少？" },
  });
  fireEvent.click(screen.getByRole("button", { name: "傳送問題" }));
  await screen.findByRole("button", { name: "來源： 第四季預算概覽" });
  fireEvent.click(screen.getByRole("button", { name: "EN" }));
  await screen.findByRole("button", { name: "Q4 budget overview" });
  const citation = screen.getByRole("button", {
    name: "Source: Q4 budget overview",
  });
  expect(citation).toHaveTextContent("Q4 budget overview");
  expect(screen.getByText("核准預算為一百萬元。")).toBeVisible();
  fireEvent.click(citation);
  await waitFor(() =>
    expect(sourceWindow.location.replace).toHaveBeenCalledWith(
      "https://docs.example.com/finance/q4-budget-overview.md",
    ),
  );
  expect(openDocument).toHaveBeenCalledWith("access", "finance-q4", "en");
});

const guardrailExamples = [
  [
    "finance",
    "en",
    [
      "Demo receipt: can I reimburse a purchase for fictional alex.receipt@example.com ?",
      "Demo reimbursement: may I add fictional contact +1 202-555-0101 to the expense report?",
    ],
  ],
  [
    "finance",
    "zh-TW",
    [
      "示範收據：可以替虛構帳號 alex.receipt@example.com 申請報銷嗎？",
      "示範報銷：可以在費用報告加入虛構聯絡電話 +1 202-555-0101 嗎？",
    ],
  ],
  [
    "operations",
    "en",
    [
      "Demo handoff: should fictional sam.handoff@example.com receive the shift notes?",
      "Demo on-call: can I list fictional contact +1 202-555-0102 for escalation?",
    ],
  ],
  [
    "operations",
    "zh-TW",
    [
      "示範交接：應將輪班紀錄寄給虛構帳號 sam.handoff@example.com 嗎？",
      "示範值班：可以將虛構電話 +1 202-555-0102 列為升級處理聯絡方式嗎？",
    ],
  ],
  [
    "people",
    "en",
    [
      "Demo leave: can I send a leave request for fictional priya.leave@example.com ?",
      "Demo contact: may I add fictional phone +1 202-555-0103 to an employee profile?",
    ],
  ],
  [
    "people",
    "zh-TW",
    [
      "示範休假：可以替虛構帳號 priya.leave@example.com 提交請假申請嗎？",
      "示範聯絡資料：可以在員工資料加入虛構電話 +1 202-555-0103 嗎？",
    ],
  ],
] as const;
it.each(guardrailExamples)(
  "offers only %s guardrail examples in %s without submitting them",
  async (department, language, questions) => {
    window.localStorage.setItem("knowledge-language", language);
    const askQuestion = vi.fn(async () => ({ answer: "", citations: [] }));
    render(
      <Workspace
        session={session}
        onSwitch={async () => {}}
        api={{
          loadDocuments: async () => [
            { id: "source", title: "Authorized source", department },
          ],
          askQuestion,
          openDocument: async () => "https://docs.example.com/source.md",
        }}
      />,
    );
    await screen.findByRole("button", { name: "Authorized source" });
    const region = screen.getByRole("region", {
      name: /suggested questions|建議問題/,
    });
    expect(within(region).getAllByRole("button")).toHaveLength(7);
    expect(
      within(region).getByText(
        language === "en"
          ? "Extra examples use fictional personal data to demonstrate the guardrail."
          : "額外範例使用虛構個人資料，示範個人資料防護機制。",
      ),
    ).toBeVisible();
    expect(
      within(region)
        .getAllByRole("button")
        .filter((button) =>
          /example\.com|202-555/.test(button.textContent ?? ""),
        ),
    ).toHaveLength(2);
    for (const question of questions) {
      fireEvent.click(within(region).getByRole("button", { name: question }));
      const input = screen.getByRole("textbox", {
        name: language === "en" ? "Your question" : "您的問題",
      });
      expect(input).toHaveValue(question);
      expect(input).toHaveFocus();
      expect(askQuestion).not.toHaveBeenCalled();
    }
  },
);
