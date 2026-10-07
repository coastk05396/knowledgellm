import { useLanguage } from "../app/language";
import type { Department } from "../app/api";
export const identities: {
  department: Department;
  label: string;
  name: string;
  initial: string;
}[] = [
  { department: "finance", label: "Finance", name: "Alex", initial: "A" },
  { department: "operations", label: "Operations", name: "Sam", initial: "S" },
  { department: "people", label: "People", name: "Priya", initial: "P" },
];
export function IdentityPicker({
  departments,
  onSwitch,
  disabled = false,
}: {
  departments: Department[];
  onSwitch: (department?: Department) => void;
  disabled?: boolean;
}) {
  const { t, language } = useLanguage();
  return (
    <div className="identity-picker">
      <div className="identity-label">
        <span className="desktop-only">{t("Identity")}</span>
        <span className="mobile-only">{t("View as")}</span>
        <span className="identity-sublabel">{t("Tap to switch")}</span>
      </div>
      <div className="identity-cards">
        {identities.map((person) => (
          <button
            key={person.department}
            className={`identity-card ${person.department} ${departments.includes(person.department) ? "selected" : ""}`}
            type="button"
            onClick={() => onSwitch(person.department)}
            disabled={disabled}
            aria-pressed={departments.includes(person.department)}
            aria-label={
              language === "zh-TW"
                ? `以其他帳號登入：${person.name}，${t(person.label)}`
                : `Sign in as another account: ${person.name}, ${person.label}`
            }
            aria-describedby="account-switch-note"
          >
            <span className="avatar">{person.initial}</span>
            <span className="identity-text">
              <span className="identity-primary">
                <strong>{person.name}</strong>
                <small>{t(person.label)}</small>
              </span>
              {departments.includes(person.department) && (
                <span className="identity-auth-subline">
                  {t("AWS Cognito Verified")}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <span id="account-switch-note" className="sr-only">
        {t(
          "Selecting a demo identity starts Cognito custom authentication. Access is limited to that persona's permitted sample documents.",
        )}
      </span>
    </div>
  );
}
