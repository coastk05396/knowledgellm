import { useLanguage } from "../app/language";
import { FileText, MessageSquare, Plus, Sparkles } from "lucide-react";
import type { ChatAnswer, Department, DocumentSummary } from "../app/api";
import { identities } from "./IdentityPicker";
import demoQuestions from "../../../api/src/knowledgellm/demo_questions.json";
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
  onSuggestion,
}: {
  documents: DocumentSummary[];
  name: string;
  departments: Department[];
  messages: Message[];
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  signedIn: boolean;
  onSuggestion: (question: string) => void;
}) {
  const { t, language } = useLanguage();
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
            {t("02. Ask KnowledgeLLM")}
          </h2>
          <span className="mobile-status">
            <span className="status-dot" />
            {t("Active")}
          </span>
          <p>{t("Access-scoped answers with source citations")}</p>
        </div>
        <button className="new-chat" onClick={onNew} disabled={busy}>
          <Plus size={18} />
          {t("New chat")}
        </button>
      </div>
      <section className="conversation" aria-label={t("Conversation")}>
        {departments.map((department) => (
          <section
            key={department}
            className={`question-suggestions ${department}`}
            aria-label={`${t(identities.find((person) => person.department === department)?.label ?? "")} ${t("suggested questions")}`}
          >
            <h3>{t("Try a question")}</h3>
            <div className="suggestion-buttons">
              {demoQuestions
                .filter((item) => item.department === department)
                .map(({ id, question, question_zh }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onSuggestion(
                        language === "zh-TW" ? question_zh : question,
                      )
                    }
                  >
                    {language === "zh-TW" ? question_zh : question}
                  </button>
                ))}
            </div>
          </section>
        ))}
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
              <div className="message assistant-message">
                <span className="assistant-icon">
                  <Sparkles />
                </span>
                <div>
                  <p className="message-label">{t("KnowledgeLLM assistant")}</p>
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
