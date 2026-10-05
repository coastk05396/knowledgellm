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
  onSwitch: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="identity-picker">
      <div className="identity-label">
        <span className="desktop-only">Identity</span>
        <span className="mobile-only">View as</span>
        <span>Tap to switch</span>
      </div>
      <div className="identity-cards">
        {identities.map((person) => (
          <button
            key={person.department}
            className={`identity-card ${person.department} ${departments.includes(person.department) ? "selected" : ""}`}
            type="button"
            onClick={onSwitch}
            disabled={disabled}
            aria-pressed={departments.includes(person.department)}
            aria-label={`Sign in as another account: ${person.name}, ${person.label}`}
            aria-describedby="account-switch-note"
          >
            <span className="avatar">{person.initial}</span>
            <span>
              <strong>{person.name}</strong>
              <small>{person.label}</small>
            </span>
          </button>
        ))}
      </div>
      <span id="account-switch-note" className="sr-only">
        Selecting an identity signs out and asks for the next user's
        credentials. Access depends on the account you sign in with.
      </span>
    </div>
  );
}
