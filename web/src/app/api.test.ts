import { afterEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "./config";
import { knowledgeApi } from "./api";
const originalUrl = appConfig.apiUrl;
afterEach(() => {
  appConfig.apiUrl = originalUrl;
  vi.unstubAllGlobals();
});
describe("Knowledge API boundary", () => {
  it.each(["hit", "miss", "bypass"])(
    "preserves cache status %s and zero inference cost",
    async (status) => {
      appConfig.apiUrl = "https://api.example.com";
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(
            JSON.stringify({
              answer: "Authorized answer",
              citations: [],
              cache_status: status,
              cost_usd: 0,
            }),
          ),
      );
      const result = await knowledgeApi.askQuestion(
        "access-token",
        "What changed?",
      );
      expect(result.cache_status).toBe(status);
      expect(result.cost_usd).toBe(0);
    },
  );
  it.each(["unknown", ["hit"], null])(
    "ignores invalid cache status %j",
    async (status) => {
      appConfig.apiUrl = "https://api.example.com";
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(
            JSON.stringify({
              answer: "Authorized answer",
              citations: [],
              cache_status: status,
            }),
          ),
      );
      expect(
        (await knowledgeApi.askQuestion("access-token", "What changed?"))
          .cache_status,
      ).toBeUndefined();
    },
  );
  it("sends the question and selected language with a bearer token", async () => {
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
      language: "en",
    });
    expect(result.answer).toBe("Authorized answer");
    expect(result.cost_usd).toBeUndefined();
  });
  it("sends Traditional Chinese as the response language", async () => {
    appConfig.apiUrl = "https://api.example.com";
    let body = "";
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      body = options.body as string;
      return new Response(
        JSON.stringify({ answer: "核准預算", citations: [] }),
      );
    });
    await knowledgeApi.askQuestion("access-token", "核准預算是多少？", "zh-TW");
    expect(JSON.parse(body)).toEqual({
      question: "核准預算是多少？",
      language: "zh-TW",
    });
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
  it("returns the authorized HTTPS source URL from the document envelope", async () => {
    appConfig.apiUrl = "https://api.example.com";
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
    const destination = await knowledgeApi.openDocument(
      "access-token",
      "finance-q4-budget-overview",
    );
    expect(destination).toBe(
      "https://private-bucket.example.com/finance/q4-budget-overview.md?signature=temporary",
    );
  });
});
