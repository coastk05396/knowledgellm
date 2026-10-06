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
  return (
    <section className="system-monitor" aria-label="System monitor">
      <div className="monitor-heading">
        <span>System monitor</span>
        <span>Session</span>
      </div>
      <div className="monitor-item">
        <ShieldCheck />
        <div>
          <span className="mono">PII guardrail</span>
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
              ? "Checking…"
              : failed
                ? "Check unavailable"
                : guardrailAction
                  ? guardrailLabels[guardrailAction]
                  : receivedAnswer
                    ? "Result unavailable"
                    : "Awaiting question"}
          </strong>
        </div>
      </div>
      <div className="monitor-item">
        <Coins />
        <div>
          <span className="mono">Token cost</span>
          <strong className="gold">
            {cost === null ? "Unavailable" : `$${cost.toFixed(4)} est.`}
          </strong>
        </div>
      </div>
    </section>
  );
}
