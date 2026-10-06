import { Coins, ShieldCheck } from "lucide-react";
export function SystemMonitor({
  cost,
  receivedAnswer,
}: {
  cost: number | null;
  receivedAnswer: boolean;
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
          <strong className="green">
            {receivedAnswer ? "Checked by API" : "Awaiting response"}
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
