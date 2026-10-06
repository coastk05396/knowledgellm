import { useState } from "react";
import { ArrowUp, LockKeyhole } from "lucide-react";
export function Composer({
  onSend,
  disabled,
  busy,
  name,
  access,
}: {
  onSend: (question: string) => Promise<boolean>;
  disabled: boolean;
  busy: boolean;
  name: string;
  access: string;
}) {
  const [question, setQuestion] = useState("");
  const submit = async () => {
    if (!question.trim() || disabled || busy) return;
    if (await onSend(question.trim())) setQuestion("");
  };
  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          aria-label="Your question"
          rows={1}
          maxLength={4000}
          value={question}
          disabled={disabled || busy}
          placeholder={
            disabled
              ? "Sign in to ask KnowledgeLLM…"
              : `Ask ${access} as ${name}…`
          }
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="submit"
          disabled={disabled || busy || !question.trim()}
          aria-label="Send question"
        >
          <ArrowUp />
        </button>
      </form>
      <p className="access-caption">
        <LockKeyhole size={14} />
        {disabled
          ? "Protected documents · Sign-in required"
          : `${name} → ${access} documents only`}
      </p>
    </div>
  );
}
