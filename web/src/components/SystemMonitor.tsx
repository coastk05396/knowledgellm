import { useLanguage } from "../app/language";
export function SystemMonitor({
  answers,
  cost,
}: {
  answers: number;
  cost: number | null;
}) {
  const { t, language } = useLanguage();
  return (
    <section className="system-monitor" aria-labelledby="session-summary-title">
      <h2 id="session-summary-title" className="monitor-heading">
        {t("This session")}
      </h2>
      <dl>
        <div className="monitor-item">
          <dt>{t("Answers")}</dt>
          <dd>{answers}</dd>
        </div>
        <div className="monitor-item">
          <dt>{t("Token cost")}</dt>
          <dd className="gold">
            {cost === null
              ? t("Unavailable")
              : language === "zh-TW"
                ? `約 $${cost.toFixed(4)}`
                : `$${cost.toFixed(4)} est.`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
