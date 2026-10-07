import { useLanguage } from "../app/language";
import { Coins, ShieldCheck } from "lucide-react";
import type { GuardrailAction } from "../app/api";
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
export function SystemMonitor({
  cost,
  receivedAnswer,
  guardrailAction,
  busy,
  failed,
}: {
  cost: number | null;
  receivedAnswer: boolean;
  guardrailAction?: GuardrailAction;
  busy?: boolean;
  failed?: boolean;
}) {
  const { t, language } = useLanguage();
  return (
    <section className="system-monitor" aria-label={t("System monitor")}>
      <div className="monitor-heading">
        <span>{t("System monitor")}</span>
        <span>{t("Session")}</span>
      </div>
      <div className="monitor-item">
        <ShieldCheck />
        <div>
          <span className="mono">{t("PII guardrail")}</span>
          <strong
            className={
              !busy &&
              (failed || (guardrailAction && guardrailAction !== "pass"))
                ? "gold"
                : "green"
            }
            role="status"
          >
            {busy
              ? t("Checking…")
              : failed
                ? t("Check unavailable")
                : guardrailAction
                  ? t(guardrailLabels[guardrailAction])
                  : receivedAnswer
                    ? t("Result unavailable")
                    : t("Awaiting question")}
          </strong>
        </div>
      </div>
      <div className="monitor-item">
        <Coins />
        <div>
          <span className="mono">{t("Token cost")}</span>
          <strong className="gold">
            {cost === null
              ? t("Unavailable")
              : language === "zh-TW"
                ? `約 $${cost.toFixed(4)}`
                : `$${cost.toFixed(4)} est.`}
          </strong>
        </div>
      </div>
    </section>
  );
}
