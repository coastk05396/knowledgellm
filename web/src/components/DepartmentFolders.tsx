import { useLanguage } from "../app/language";
import { useEffect, useState } from "react";
import { ChevronRight, FileText, Folder, LockKeyhole } from "lucide-react";
import type { DocumentSummary } from "../app/api";
import { identities } from "./IdentityPicker";
export function DepartmentFolders({
  documents,
  onOpen,
  loading,
  authorizedListing,
  openedDocumentId,
}: {
  documents: DocumentSummary[];
  onOpen: (id: string, opener: HTMLElement) => void;
  loading: boolean;
  authorizedListing: boolean;
  openedDocumentId?: string | null;
}) {
  const { t, language } = useLanguage();
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>([]);

  useEffect(() => {
    setExpandedDepartments([]);
  }, [documents, authorizedListing]);
  return (
    <section className="folders" aria-labelledby="folders-title">
      <div className="folder-heading">
        <h2 id="folders-title">{t("Sources")}</h2>
        <p>
          {authorizedListing && documents.length
            ? language === "zh-TW"
              ? `可用 ${documents.length} 份`
              : `${documents.length} available`
            : t("PERSONA ACCESS")}
        </p>
      </div>
      {loading && (
        <p
          className="folder-loading"
          role="status"
          aria-label={`${t("Loading")}...`}
        >
          <span aria-hidden="true">
            {t("Loading")}
            <span className="thinking-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
        </p>
      )}
      <div className="folder-list">
        {identities.map((person) => {
          const docs = documents.filter(
            (doc) => doc.department === person.department,
          );
          const permitted = authorizedListing && docs.length > 0;
          const expanded =
            permitted && expandedDepartments.includes(person.department);
          return (
            <div
              key={person.department}
              className={`folder-group ${person.department}`}
            >
              <button
                className="folder-button"
                disabled={!permitted}
                aria-label={`${t(person.label)} / ${person.name} — ${t(permitted ? "Unlocked" : "restricted")}`}
                aria-expanded={expanded}
                aria-controls={`files-${person.department}`}
                aria-describedby={
                  permitted || loading
                    ? undefined
                    : `locked-${person.department}`
                }
                onClick={() =>
                  setExpandedDepartments((current) =>
                    current.includes(person.department)
                      ? current.filter((d) => d !== person.department)
                      : [...current, person.department],
                  )
                }
              >
                <Folder />
                <strong className="folder-label">
                  <span className="folder-name">
                    {t(person.label)} / {person.name}
                  </span>
                  {permitted && (
                    <span className="folder-unlocked">{t("Unlocked")}</span>
                  )}
                </strong>
                <span className="folder-count">
                  {permitted ? docs.length : <LockKeyhole size={16} />}
                </span>
                <ChevronRight className="folder-chevron" size={18} />
              </button>
              {!permitted && !loading && (
                <p id={`locked-${person.department}`} className="folder-hint">
                  {language === "zh-TW"
                    ? `切換為 ${person.name} 才能查看與提問`
                    : `Switch to ${person.name} to view and ask`}
                </p>
              )}
              <div
                id={`files-${person.department}`}
                hidden={!expanded}
                className="files"
              >
                {docs.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    aria-current={
                      openedDocumentId === doc.id ? "page" : undefined
                    }
                    onClick={(event) => onOpen(doc.id, event.currentTarget)}
                  >
                    <FileText size={19} />
                    <span>{t(doc.title)}</span>
                    {openedDocumentId === doc.id && (
                      <span className="file-reading" aria-hidden="true">
                        {t("Reading")}
                      </span>
                    )}
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
