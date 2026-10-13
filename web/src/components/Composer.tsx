import { useLanguage } from "../app/language";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, LockKeyhole } from "lucide-react";
export function Composer({
  onSend,
  disabled,
  busy,
  name,
  access,
  sourceCount,
  suggestion,
}: {
  onSend: (question: string) => Promise<boolean>;
  disabled: boolean;
  busy: boolean;
  name: string;
  access: string;
  sourceCount: number;
  suggestion?: { question: string } | null;
}) {
  const { t, language } = useLanguage();
  const [question, setQuestion] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (suggestion === undefined) return;
    setQuestion(suggestion?.question ?? "");
    if (suggestion) input.current?.focus();
  }, [suggestion]);
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
        <div className="composer-field">
          <p id="composer-scope" className="composer-scope">
            <LockKeyhole size={12} aria-hidden="true" />
            <span>
              {disabled
                ? t("Protected documents · Sign-in required")
                : language === "zh-TW"
                  ? `以 ${name} 的身分提問 · 只會搜尋${access}的 ${sourceCount} 份來源`
                  : `Asking as ${name} · searches only ${access}'s ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`}
            </span>
          </p>
          <textarea
            ref={input}
            aria-label={t("Your question")}
            aria-describedby="composer-scope"
            rows={1}
            maxLength={4000}
            enterKeyHint="send"
            value={question}
            disabled={disabled || busy}
            placeholder={t(
              disabled
                ? "Sign in to ask KnowledgeLLM…"
                : "Type a question, press Enter to send",
            )}
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
        </div>
        <button
          type="submit"
          disabled={disabled || busy || !question.trim()}
          aria-label={t("Send question")}
        >
          <ArrowUp />
        </button>
      </form>
    </div>
  );
}
