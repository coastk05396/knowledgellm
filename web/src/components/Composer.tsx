import { useLanguage } from "../app/language";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, LockKeyhole } from "lucide-react";
export function Composer({
  onSend,
  disabled,
  busy,
  name,
  access,
  suggestion,
}: {
  onSend: (question: string) => Promise<boolean>;
  disabled: boolean;
  busy: boolean;
  name: string;
  access: string;
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
        <textarea
          ref={input}
          aria-label={t("Your question")}
          rows={1}
          maxLength={4000}
          value={question}
          disabled={disabled || busy}
          placeholder={
            disabled
              ? t("Sign in to ask KnowledgeLLM…")
              : language === "zh-TW"
                ? `以 ${name} 的身分詢問${access}…`
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
          aria-label={t("Send question")}
        >
          <ArrowUp />
        </button>
      </form>
      <p className="access-caption">
        <LockKeyhole size={14} />
        {disabled
          ? t("Protected documents · Sign-in required")
          : language === "zh-TW"
            ? `${name} → 僅限${access}文件`
            : `${name} → ${access} documents only`}
      </p>
    </div>
  );
}
