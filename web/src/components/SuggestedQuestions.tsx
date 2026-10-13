import { useLanguage } from "../app/language";
import { ShieldCheck } from "lucide-react";
import type { Department } from "../app/api";
import demoQuestions from "../../../api/src/knowledgellm/demo_questions.json";
import guardrailQuestions from "../data/guardrail-questions.json";
import { identities } from "./IdentityPicker";

/** Guardrail demonstrations follow each department's document questions. */
const suggestedQuestions = [...demoQuestions, ...guardrailQuestions];

export function SuggestedQuestions({
  departments,
  busy,
  disabled,
  onSuggestion,
}: {
  departments: Department[];
  busy: boolean;
  disabled: boolean;
  onSuggestion: (question: string) => void;
}) {
  const { t, language } = useLanguage();
  return (
    <div className="suggestion-row">
      {departments.map((department) => (
        <section
          key={department}
          className={`suggestion-chips ${department}`}
          aria-label={`${t(identities.find((person) => person.department === department)?.label ?? "")} ${t("suggested questions")}`}
        >
          {suggestedQuestions
            .filter((item) => item.department === department)
            .map(({ id, question, question_zh }) => {
              const guardrail = id.startsWith("guardrail-");
              const text = language === "zh-TW" ? question_zh : question;
              return (
                <button
                  key={id}
                  type="button"
                  className={guardrail ? "guardrail-question" : undefined}
                  aria-describedby={
                    guardrail ? `guardrail-note-${department}` : undefined
                  }
                  disabled={busy || disabled}
                  onFocus={(event) => {
                    const chip = event.currentTarget;
                    const row = chip.parentElement;
                    if (row)
                      row.scrollLeft = chip.offsetLeft - row.offsetLeft - 4;
                  }}
                  onClick={() => onSuggestion(text)}
                >
                  {guardrail && <ShieldCheck size={14} aria-hidden="true" />}
                  {text}
                </button>
              );
            })}
          <p id={`guardrail-note-${department}`} className="guardrail-note">
            {t(
              "Extra examples use fictional personal data to demonstrate the guardrail.",
            )}
          </p>
        </section>
      ))}
    </div>
  );
}
