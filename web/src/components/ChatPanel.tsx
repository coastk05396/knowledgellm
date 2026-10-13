import { useLanguage } from "../app/language";
import { useLayoutEffect, useRef } from "react";
import { Check, MessageSquare, Plus, Sparkles } from "lucide-react";
import type {
  ChatAnswer,
  Department,
  DocumentSummary,
  GuardrailAction,
} from "../app/api";
import { identities } from "./IdentityPicker";
export interface Message {
  question: string;
  /** Absent while the answer is still pending. */
  response?: ChatAnswer;
}
/** A source to show in the reader, optionally with its citation context. */
export interface SourceRequest {
  id: string;
  number?: number;
  excerpt?: string;
}
const guardrailLabels: Record<GuardrailAction, string> = {
  pass: "No PII detected",
  question_pii_blocked: "Question PII blocked",
  answer_pii_blocked: "Answer PII blocked",
  source_pii_redacted: "Source PII masked",
  no_sources: "PII check completed",
  empty_answer: "PII check completed",
  invalid_citations: "PII check completed",
  access_denied: "Not checked · Access denied",
  invalid_question: "Not checked · Invalid question",
};
export function ChatPanel({
  documents,
  name,
  departments,
  messages,
  busy,
  onNew,
  onOpen,
  signedIn,
  openedDocumentId,
}: {
  documents: DocumentSummary[];
  name: string;
  departments: Department[];
  messages: Message[];
  busy: boolean;
  onNew: () => void;
  onOpen: (source: SourceRequest, opener: HTMLElement) => void;
  signedIn: boolean;
  openedDocumentId?: string | null;
}) {
  const { t, language } = useLanguage();
  const conversationRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (conversation && messages.length)
      conversation.scrollTop = conversation.scrollHeight;
  }, [messages]);
  const access = identities
    .filter((person) => departments.includes(person.department))
    .map((person) => t(person.label))
    .join(" & ");
  const accent = departments[0] ?? "finance";
  const firstName = name.split(" ")[0];
  return (
    <>
      <div className="chat-heading">
        <div>
          <h2>
            <MessageSquare className="mobile-only" />
            {t("Ask KnowledgeLLM")}
          </h2>
          <span className="mobile-status">
            <span className="status-dot" />
            {t("Active")}
          </span>
        </div>
        <button className="new-chat" onClick={onNew} disabled={busy}>
          <Plus size={18} />
          {t("New chat")}
        </button>
      </div>
      <section
        ref={conversationRef}
        className="conversation"
        aria-label={t("Conversation")}
      >
        <div className="message-list" aria-live="polite">
          {messages.map(({ question, response }, index) => {
            const citations = (response?.citations ?? []).map(
              (citation, position) => {
                const document = documents.find(
                  (doc) => doc.id === citation.document_id,
                );
                const department = identities.find(
                  (person) => person.department === document?.department,
                );
                return {
                  source: {
                    id: citation.document_id,
                    number: position + 1,
                    excerpt: citation.excerpt,
                  },
                  title: t(document?.title ?? citation.title),
                  department: department ? t(department.label) : null,
                };
              },
            );
            return (
              <div key={index} className={`exchange ${accent}`}>
                <div className="message user-message">
                  <span className="sr-only">
                    {name} · {access}
                  </span>
                  <p className="message-text">{question}</p>
                </div>
                {response && (
                  <div
                    className={`message assistant-message${index === messages.length - 1 ? " answer-entry" : ""}`}
                  >
                    <span className="sr-only">
                      {t("KnowledgeLLM assistant")}
                    </span>
                    <p className="message-text">
                      {response.answer}
                      {citations.map(({ source, title }) => (
                        <button
                          key={source.number}
                          type="button"
                          className="citation-marker"
                          aria-label={
                            language === "zh-TW"
                              ? `來源 ${source.number}：${title}`
                              : `Source ${source.number}: ${title}`
                          }
                          onClick={(event) =>
                            onOpen(source, event.currentTarget)
                          }
                        >
                          {source.number}
                        </button>
                      ))}
                    </p>
                    {citations.length > 0 && (
                      <div className="citations">
                        {citations.map(({ source, title, department }) => (
                          <button
                            key={source.number}
                            type="button"
                            className="citation-card"
                            aria-label={`${t("Source:")} ${title}`}
                            aria-current={
                              openedDocumentId === source.id
                                ? "true"
                                : undefined
                            }
                            onClick={(event) =>
                              onOpen(source, event.currentTarget)
                            }
                          >
                            <span className="citation-number">
                              {source.number}
                            </span>
                            <span className="citation-text">
                              <strong>{title}</strong>
                              {department && <span>{department}</span>}
                            </span>
                            {openedDocumentId === source.id && (
                              <span className="citation-open">
                                {t("Open on the right")}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="answer-status">
                      <span
                        className={
                          response.guardrail_action === "pass"
                            ? "green"
                            : "gold"
                        }
                      >
                        {response.guardrail_action === "pass" && (
                          <Check size={13} aria-hidden="true" />
                        )}
                        {t(
                          response.guardrail_action
                            ? guardrailLabels[response.guardrail_action]
                            : "Result unavailable",
                        )}
                      </span>
                      {response.cache_status === "hit" && (
                        <span
                          className="gold"
                          role="status"
                          aria-label={t("Cached Hit")}
                        >
                          {t("Cached Hit")}
                        </span>
                      )}
                      {citations.length > 0 && (
                        <span className="answer-scope">
                          {language === "zh-TW"
                            ? `僅根據 ${firstName} 有權限的來源作答`
                            : `Answered only from sources ${firstName} can access`}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {busy && (
            <p role="status" className="thinking">
              <Sparkles
                size={18}
                className="thinking-icon"
                aria-hidden="true"
              />
              <span>
                {t("Checking your permitted sources…").replace(/…$/, "")}
                <span className="sr-only">…</span>
                <span className="thinking-dots" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </span>
            </p>
          )}
          {signedIn && !busy && !messages.length && (
            <div className="empty-chat">
              <Sparkles size={24} />
              <p>{t("Ask a question to start a conversation.")}</p>
              <span>
                {t("Every answer starts with your permitted sources.")}
              </span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
