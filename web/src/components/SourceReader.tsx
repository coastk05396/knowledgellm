import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useLanguage } from "../app/language";
import type { Department } from "../app/api";
import {
  findExcerpt,
  parseMarkdown,
  type MarkdownListItem,
} from "../app/markdown";
import { identities } from "./IdentityPicker";

export interface ReaderSource {
  /** Changes on every open, including re-opening the same source. */
  request: number;
  id: string;
  title: string;
  department?: Department;
  /** Citation number when the reader was opened from an answer. */
  number?: number;
  excerpt?: string;
  /** Absent while the authorized document is still loading. */
  document?: { url: string; content?: string };
  failed?: boolean;
}

function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, index) =>
      /^\*\*[^*]+\*\*$/.test(part) ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : /^`[^`]+`$/.test(part) ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

function MarkdownText({
  content,
  excerpt,
}: {
  content: string;
  excerpt?: string;
}) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const range = useMemo(
    () => findExcerpt(content, excerpt),
    [content, excerpt],
  );
  const cited = (block: { start: number; end: number }) =>
    range && block.start < range.end && block.end > range.start
      ? { "data-cited": true }
      : {};
  const items = (entries: MarkdownListItem[]) =>
    entries.map((entry) => (
      <li key={entry.start}>
        <span {...cited(entry)}>{inline(entry.text)}</span>
        {entry.children.length > 0 && <ul>{items(entry.children)}</ul>}
      </li>
    ));
  return (
    <div className="reader-text">
      {blocks.map((block) => {
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return <List key={block.start}>{items(block.items)}</List>;
        }
        if (block.type === "quote")
          return (
            <blockquote key={block.start} {...cited(block)}>
              {inline(block.text)}
            </blockquote>
          );
        if (block.type === "heading") {
          const Heading = block.level <= 2 ? "h3" : "h4";
          return (
            <Heading key={block.start} {...cited(block)}>
              {inline(block.text)}
            </Heading>
          );
        }
        return (
          <p key={block.start} {...cited(block)}>
            {inline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export function SourceReader({
  source,
  modal,
  closing = false,
  onDismiss,
  onClose,
}: {
  source: ReaderSource | null;
  /** Narrow layouts present the reader as a modal bottom sheet. */
  modal: boolean;
  /** The sheet is leaving; it stays mounted until its exit has finished. */
  closing?: boolean;
  /** The user asked to close the reader. */
  onDismiss: () => void;
  /** The sheet's exit has finished. */
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const closeButton = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const open = source !== null;
  const content = source?.document?.content;
  useEffect(() => {
    if (!closing) return;
    const exitDuration = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
      ? 80
      : 200;
    const timer = setTimeout(onClose, exitDuration);
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  useEffect(() => {
    // Also after a re-open that cancelled an exit: focus belongs in the sheet.
    if (modal && open) closeButton.current?.focus();
  }, [modal, open, source?.request]);
  useEffect(() => {
    if (!modal || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal, open, onDismiss]);
  useLayoutEffect(() => {
    const container = body.current;
    if (!container) return;
    const passage = container.querySelector("[data-cited]");
    // Scroll only the reader itself; the conversation must not move.
    container.scrollTop = passage
      ? container.scrollTop +
        passage.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        12
      : 0;
  }, [source?.id, source?.excerpt, content]);
  const department = identities.find(
    (person) => person.department === source?.department,
  );
  const origin = [
    source?.number === undefined
      ? null
      : `${language === "zh-TW" ? "來源" : "Source"} ${source.number}`,
    department ? t(department.label) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {modal && open && (
        <div
          className={`reader-backdrop${closing ? " closing" : ""}`}
          aria-hidden="true"
          onClick={(event) => {
            // Ignore only the second click of the gesture that opened the sheet.
            if (event.detail <= 1) onDismiss();
          }}
        />
      )}
      <section
        id="reader-panel"
        className={`reader-panel ${source?.department ?? ""}${modal && closing ? " closing" : ""}`}
        role={modal ? "dialog" : "complementary"}
        aria-modal={modal ? true : undefined}
        aria-label={t("Source content")}
        data-open={open}
      >
        {source ? (
          <div
            key={`${source.id}:${source.excerpt ?? ""}`}
            className="reader-content"
          >
            <div className="reader-heading">
              <div>
                {origin && <p className="reader-origin">{origin}</p>}
                <h2>{t(source.title)}</h2>
              </div>
              <button
                ref={closeButton}
                type="button"
                className="reader-close"
                aria-label={t("Close source content")}
                onClick={onDismiss}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div ref={body} className="reader-body" tabIndex={0}>
              {source.failed ? (
                <p role="alert" className="error-message">
                  {t("The source could not be opened. Please try again.")}
                </p>
              ) : !source.document ? (
                <p role="status">{t("Loading")}…</p>
              ) : content ? (
                <MarkdownText content={content} excerpt={source.excerpt} />
              ) : (
                <p className="reader-note">
                  {t(
                    "A preview is unavailable for this source. Open the full document instead.",
                  )}
                </p>
              )}
            </div>
            {source.document && (
              <a
                className="reader-link"
                href={source.document.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Open full document in a new tab")}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </div>
        ) : (
          <p className="reader-empty">
            {t("Select a source or a citation to read it here.")}
          </p>
        )}
      </section>
    </>
  );
}
