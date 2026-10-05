import { afterEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "./config";
import { knowledgeApi } from "./api";
const originalUrl = appConfig.apiUrl;
afterEach(() => {
  appConfig.apiUrl = originalUrl;
  vi.unstubAllGlobals();
});
describe("Knowledge API boundary", () => {
  it("sends only the question with a bearer token", async () => {
    appConfig.apiUrl = "https://api.example.com/";
    let sentUrl = "";
    let sent: RequestInit = {};
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      sentUrl = url;
      sent = options;
      return new Response(
        JSON.stringify({ answer: "Authorized answer", citations: [] }),
      );
    });
    const result = await knowledgeApi.askQuestion(
      "access-token",
      "What changed?",
    );
    expect(sentUrl).toBe("https://api.example.com/chat");
    expect(sent.method).toBe("POST");
    expect(sent.headers).toEqual({
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(sent.body as string)).toEqual({
      question: "What changed?",
    });
    expect(result.answer).toBe("Authorized answer");
    expect(result.cost_usd).toBeUndefined();
  });
  it("rejects unknown departments rather than rendering their documents", async () => {
    appConfig.apiUrl = "https://api.example.com";
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            documents: [
              { id: "restricted", title: "Private", department: "admin" },
            ],
          }),
        ),
    );
    await expect(knowledgeApi.loadDocuments("access-token")).rejects.toThrow();
  });
  it("treats document IDs as opaque and rejects non-HTTPS source URLs", async () => {
    appConfig.apiUrl = "https://api.example.com";
    let sentUrl = "";
    vi.stubGlobal("fetch", async (url: string) => {
      sentUrl = url;
      return new Response(
        JSON.stringify({
          document: {
            id: "finance/id with spaces",
            title: "Q4 budget overview",
            url: "javascript:alert(1)",
          },
        }),
      );
    });
    await expect(
      knowledgeApi.openDocument("access-token", "finance/id with spaces"),
    ).rejects.toThrow();
    expect(sentUrl).toBe(
      "https://api.example.com/documents/finance%2Fid%20with%20spaces",
    );
  });
  it("opens the authorized source URL from the document envelope", async () => {
    appConfig.apiUrl = "https://api.example.com";
    let destination = "";
    vi.stubGlobal("window", {
      location: {
        assign: (url: string) => {
          destination = url;
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            document: {
              id: "finance-q4-budget-overview",
              title: "Q4 budget overview",
              url: "https://private-bucket.example.com/finance/q4-budget-overview.md?signature=temporary",
            },
          }),
        ),
    );
    await knowledgeApi.openDocument(
      "access-token",
      "finance-q4-budget-overview",
    );
    expect(destination).toBe(
      "https://private-bucket.example.com/finance/q4-budget-overview.md?signature=temporary",
    );
  });
});
