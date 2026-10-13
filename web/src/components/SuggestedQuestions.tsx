import { useLanguage } from "../app/language";
import type { Department } from "../app/api";
import demoQuestions from "../../../api/src/knowledgellm/demo_questions.json";
import guardrailQuestions from "../data/guardrail-questions.json";
import { identities } from "./IdentityPicker";

const suggestedQuestions = [...demoQuestions, ...guardrailQuestions];

export function SuggestedQuestions({
  departments,
  busy,
  onSuggestion,
}: {
  departments: Department[];
  busy: boolean;
  onSuggestion: (question: string) => void;
}) {
  const { t, language } = useLanguage();
  return (
    <div className="suggestion-groups">
      {departments.map((department) => (
        <section
          key={department}
          className={`question-suggestions ${department}`}
          aria-label={`${t(identities.find((person) => person.department === department)?.label ?? "")} ${t("suggested questions")}`}
        >
          <div className="suggestion-buttons">
            {suggestedQuestions
              .filter((item) => item.department === department)
              .map(({ id, question, question_zh }) => (
                <button
                  key={id}
                  type="button"
                  className={
                    id.startsWith("guardrail-")
                      ? "guardrail-question"
                      : undefined
                  }
                  disabled={busy}
                  onClick={() =>
                    onSuggestion(language === "zh-TW" ? question_zh : question)
                  }
                >
                  {language === "zh-TW" ? question_zh : question}
                </button>
              ))}
          </div>
          <p className="guardrail-note">
            {t(
              "Extra examples use fictional personal data to demonstrate the guardrail.",
            )}
          </p>
        </section>
      ))}
    </div>
  );
}
