import { useLanguage } from "../app/language";
import { useLayoutEffect, useRef } from "react";
import { FileText, MessageSquare, Plus, Sparkles } from "lucide-react";
import type { ChatAnswer, Department, DocumentSummary } from "../app/api";
import { identities } from "./IdentityPicker";
export interface Message {
  question: string;
  response: ChatAnswer;
}
export function ChatPanel({
  documents,
  name,
  departments,
  messages,
  busy,
  onNew,
  onOpen,
  signedIn,
}: {
  documents: DocumentSummary[];
  name: string;
  departments: Department[];
  messages: Message[];
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  signedIn: boolean;
}) {
  const { t } = useLanguage();
  const conversationRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (conversation && messages.length)
      conversation.scrollTop = conversation.scrollHeight;
  }, [messages.length]);
  const access = identities
    .filter((person) => departments.includes(person.department))
    .map((person) => t(person.label))
    .join(" & ");
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
          {messages.map((message, index) => (
            <div key={index} className="exchange">
              <div
                className={`message user-message ${departments[0] ?? "finance"}`}
              >
                <span className="avatar">{name.slice(0, 1)}</span>
                <div>
                  <p className="message-label">
                    {name} · {access}
                  </p>
                  <p className="message-text">{message.question}</p>
                </div>
              </div>
              <div
                className={`message assistant-message${index === messages.length - 1 ? " answer-entry" : ""}`}
              >
                <span className="assistant-icon">
                  <Sparkles />
                </span>
                <div>
                  <div className="assistant-meta">
                    <p className="message-label">
                      {t("KnowledgeLLM assistant")}
                    </p>
                    {message.response.cache_status === "hit" && (
                      <span
                        className="cache-hit"
                        role="status"
                        aria-label={t("Cached Hit")}
                      >
                        {t("Cached Hit")}
                      </span>
                    )}
                  </div>
                  <p className="message-text">{message.response.answer}</p>
                  <div className={`citations ${departments[0] ?? "finance"}`}>
                    {message.response.citations.map((citation) => {
                      const title = t(
                        documents.find((doc) => doc.id === citation.document_id)
                          ?.title ?? citation.title,
                      );
                      return (
                        <button
                          key={citation.document_id}
                          onClick={() => onOpen(citation.document_id)}
                          aria-label={`${t("Source:")} ${title}`}
                        >
                          <FileText size={18} />
                          {title}
                          <span aria-hidden="true">↗</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
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
