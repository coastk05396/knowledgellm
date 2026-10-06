import { FileText, MessageSquare, Plus, Sparkles } from "lucide-react";
import type { ChatAnswer, Department } from "../app/api";
import { identities } from "./IdentityPicker";
const suggestedQuestions: Record<Department, readonly string[]> = {
  finance: [
    "What is the total approved Q4 budget?",
    "What changed in the Q4 budget?",
    "Which flight classes are allowed?",
    "What is the hotel allowance per night?",
    "When must expense reports be submitted?",
  ],
  operations: [
    "How quickly must a P1 incident be acknowledged?",
    "How often should P1 status updates be posted?",
    "Who handles on-call escalation?",
    "What must be included in a shift handoff?",
    "When are routine maintenance windows scheduled?",
  ],
  people: [
    "How many vacation days do employees receive?",
    "How many unused vacation days can carry over?",
    "What is the annual education budget?",
    "What is the home office allowance?",
    "How much parental leave is available?",
  ],
};
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
  onSuggestion,
}: {
  name: string;
  departments: Department[];
  messages: Message[];
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  signedIn: boolean;
  onSuggestion: (question: string) => void;
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
        {departments.map((department) => (
          <section
            key={department}
            className={`question-suggestions ${department}`}
            aria-label={`${identities.find((person) => person.department === department)?.label} suggested questions`}
          >
            <h3>Try a question</h3>
            <div className="suggestion-buttons">
              {suggestedQuestions[department].map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={busy}
                  onClick={() => onSuggestion(question)}
                >
                  {question}
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
