import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  LockKeyhole,
} from "lucide-react";
import type { DocumentSummary } from "../app/api";
import { identities } from "./IdentityPicker";
export function DepartmentFolders({
  documents,
  onOpen,
  loading,
}: {
  documents: DocumentSummary[];
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  const [closed, setClosed] = useState<string[]>([]);

  useEffect(() => {
    // Auto-expand newly permitted folders when documents change
    setClosed([]);
  }, [documents]);
  return (
    <section className="folders" aria-labelledby="folders-title">
      <div className="folder-heading">
        <h2 id="folders-title">01. Department folders</h2>
        <p>Each folder is linked to one user</p>
      </div>
      {loading && <p role="status">Loading permitted documents…</p>}
      <div className="folder-list">
        {identities.map((person) => {
          const docs = documents.filter(
            (doc) => doc.department === person.department,
          );
          const permitted = docs.length > 0;
          const expanded = permitted && !closed.includes(person.department);
          return (
            <div
              key={person.department}
              className={`folder-group ${person.department}`}
            >
              <button
                className="folder-button"
                disabled={!permitted}
                aria-label={`${person.label} / ${person.name}${permitted ? "" : " — restricted"}`}
                aria-expanded={expanded}
                aria-controls={`files-${person.department}`}
                onClick={() =>
                  setClosed((current) =>
                    current.includes(person.department)
                      ? current.filter((d) => d !== person.department)
                      : [...current, person.department],
                  )
                }
              >
                <Folder />
                <strong>
                  {person.label} / {person.name}
                </strong>
                <span className="folder-count">
                  {permitted ? docs.length : <LockKeyhole size={16} />}
                </span>
                {expanded ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
              <div
                id={`files-${person.department}`}
                hidden={!expanded}
                className="files"
              >
                {docs.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    onClick={() => onOpen(doc.id)}
                  >
                    <FileText size={19} />
                    <span>{doc.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
