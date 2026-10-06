import {
  FileText,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ChatAnswer, Department } from "../app/api";
import { identities } from "./IdentityPicker";
export interface Message {
  question: string;
  response: ChatAnswer;
}
export function ChatPanel({
  name,
  departments,
  messages,
  busy,
  onNew,
  onOpen,
  signedIn,
}: {
  name: string;
  departments: Department[];
  messages: Message[];
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  signedIn: boolean;
}) {
  const access = identities
    .filter((person) => departments.includes(person.department))
    .map((person) => person.label)
    .join(" & ");
  return (
    <>
      <div className="chat-heading">
        <div>
          <h2>
            <MessageSquare className="mobile-only" />
            02. Ask KnowledgeLLM
          </h2>
          <span className="mobile-status">
            <span className="status-dot" />
            Active
          </span>
          <p>Access-scoped answers with source citations</p>
        </div>
        <button className="new-chat" onClick={onNew} disabled={busy}>
          <Plus size={18} />
          New chat
        </button>
      </div>
      <section className="conversation" aria-label="Conversation">
        <div className={`intro ${departments[0] ?? "finance"}`}>
          <p className="eyebrow">
            <span className="status-dot" />
            {signedIn ? "Active identity" : "Secure workspace"} /{" "}
            {access || "Sign-in required"}
          </p>
          <h1 className="identity-title">
            {signedIn
              ? `${name.split(" ")[0]} ↔ ${access || "No access"}`
              : "Your knowledge. Your access."}
          </h1>
          <p className="intro-copy">
            <span className="desktop-copy">
              {signedIn
                ? `KnowledgeLLM answers from ${access || "permitted"} documents that ${name.split(" ")[0]} is permitted to view. Sign in with a different account to switch departments.`
                : "Sign in to browse your department's documents and get answers backed by the sources you can access."}
            </span>
            <span className="mobile-copy">
              {signedIn
                ? `Answers use only ${access} files ${name.split(" ")[0]} can access.`
                : "Sign in to browse your permitted department files."}
            </span>
          </p>
          <div className="badges">
            <span className="department-badge">
              <FileText size={18} />
              {access || "Department documents"}
            </span>
            <span className="permission-badge">
              <ShieldCheck size={18} />
              Permission-aware
            </span>
          </div>
        </div>
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
                  <p className="message-label">KnowledgeLLM assistant</p>
                  <p className="message-text">{message.response.answer}</p>
                  <div className={`citations ${departments[0] ?? "finance"}`}>
                    {message.response.citations.map((citation) => (
                      <button
                        key={citation.document_id}
                        onClick={() => onOpen(citation.document_id)}
                        aria-label={`Source: ${citation.title}`}
                      >
                        <FileText size={18} />
                        {citation.title}
                        <span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {busy && (
            <p role="status" className="thinking">
              <Sparkles size={18} />
              Checking your permitted sources…
            </p>
          )}
          {signedIn && !busy && !messages.length && (
            <div className="empty-chat">
              <Sparkles size={24} />
              <p>Ask a question to start a conversation.</p>
              <span>Every answer starts with your permitted sources.</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
