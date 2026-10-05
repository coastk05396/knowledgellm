import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Workspace } from "./App";

const session = { accessToken: "access", name: "Alex Morgan" };
describe("Authorized knowledge workspace", () => {
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
          openDocument: async () => {},
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
          openDocument: async () => {},
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
        openDocument: async () => {},
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
        openDocument: async () => {},
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
