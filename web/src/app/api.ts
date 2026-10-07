import type { Language } from "./language";
import { appConfig } from "./config";
export type Department = "finance" | "operations" | "people";
export interface DocumentSummary {
  id: string;
  title: string;
  department: Department;
}
export const guardrailActions = [
  "pass",
  "question_pii_blocked",
  "answer_pii_blocked",
  "source_pii_redacted",
  "no_sources",
  "empty_answer",
  "invalid_citations",
  "access_denied",
  "invalid_question",
] as const;
export type GuardrailAction = (typeof guardrailActions)[number];
function isGuardrailAction(value: unknown): value is GuardrailAction {
  return guardrailActions.some((action) => action === value);
}
export interface ChatAnswer {
  answer: string;
  citations: { document_id: string; title: string }[];
  usage?: { total_tokens?: number };
  cost_usd?: number;
  guardrail_action?: GuardrailAction;
  cache_status?: "hit" | "miss" | "bypass";
}
export interface KnowledgeApi {
  loadDocuments(token: string, language?: Language): Promise<DocumentSummary[]>;
  askQuestion(
    token: string,
    question: string,
    language?: Language,
  ): Promise<ChatAnswer>;
  openDocument(token: string, id: string, language?: Language): Promise<string>;
}
async function request(
  path: string,
  token: string,
  question?: string,
  language: Language = "en",
): Promise<unknown> {
  if (!appConfig.apiUrl) throw new Error("API unavailable");
  const response = await fetch(appConfig.apiUrl.replace(/\/$/, "") + path, {
    signal: AbortSignal.timeout(25000),
    method: question === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(question === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(question === undefined
      ? {}
      : { body: JSON.stringify({ question, language }) }),
  });
  if (!response.ok) throw new Error("Request unavailable");
  return response.json();
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");
export const knowledgeApi: KnowledgeApi = {
  async loadDocuments(token, language = "en") {
    const data = await request(`/documents?language=${language}`, token);
    if (!isRecord(data) || !Array.isArray(data.documents))
      throw new Error("Invalid documents");
    return data.documents.map((doc: unknown) => {
      if (
        !isRecord(doc) ||
        typeof doc.id !== "string" ||
        typeof doc.title !== "string" ||
        !["finance", "operations", "people"].includes(String(doc.department))
      )
        throw new Error("Invalid document");
      return {
        id: doc.id,
        title: doc.title,
        department: doc.department as Department,
      };
    });
  },
  async askQuestion(token, question, language = "en") {
    const data = await request("/chat", token, question, language);
    if (
      !isRecord(data) ||
      typeof data.answer !== "string" ||
      !Array.isArray(data.citations)
    )
      throw new Error("Invalid answer");
    const citations = data.citations.map((citation: unknown) => {
      if (
        !isRecord(citation) ||
        typeof citation.document_id !== "string" ||
        typeof citation.title !== "string"
      )
        throw new Error("Invalid citation");
      return { document_id: citation.document_id, title: citation.title };
    });
    return {
      answer: data.answer,
      ...(typeof data.cache_status === "string" &&
      ["hit", "miss", "bypass"].includes(data.cache_status)
        ? { cache_status: data.cache_status as "hit" | "miss" | "bypass" }
        : {}),
      citations,
      ...(isGuardrailAction(data.guardrail_action)
        ? { guardrail_action: data.guardrail_action }
        : {}),
      ...(typeof data.cost_usd === "number" &&
      Number.isFinite(data.cost_usd) &&
      data.cost_usd >= 0
        ? { cost_usd: data.cost_usd }
        : {}),
    };
  },
  async openDocument(token, id, language = "en") {
    const data = await request(
      `/documents/${encodeURIComponent(id)}?language=${language}`,
      token,
    );
    if (
      !isRecord(data) ||
      !isRecord(data.document) ||
      data.document.id !== id ||
      typeof data.document.title !== "string" ||
      typeof data.document.url !== "string" ||
      new URL(data.document.url).protocol !== "https:"
    )
      throw new Error("Invalid document link");
    return data.document.url;
  },
};
