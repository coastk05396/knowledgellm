import {
  LanguageBoundary,
  LanguageProvider,
  LanguageSwitch,
  useLanguage,
  type Language,
} from "./language";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Folder, MessageSquare, Terminal } from "lucide-react";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import type { Session } from "../auth/auth";
import { authConfigured } from "./config";
import {
  knowledgeApi,
  type DocumentSummary,
  type KnowledgeApi,
  type SourceDocument,
} from "./api";
import { IdentityPicker, identities } from "../components/IdentityPicker";
import { DepartmentFolders } from "../components/DepartmentFolders";
import {
  ChatPanel,
  type Message,
  type SourceRequest,
} from "../components/ChatPanel";
import { Composer } from "../components/Composer";
import { SystemMonitor } from "../components/SystemMonitor";
import { SuggestedQuestions } from "../components/SuggestedQuestions";
import { SourceReader } from "../components/SourceReader";
import { Toast } from "../components/Toast";
import "../styles/tokens.css";
import "../styles/app.css";
interface WorkspaceProps {
  session: Session | null;
  onSwitch: (department?: string) => Promise<void>;
  api?: KnowledgeApi;
  authLoading?: boolean;
  authError?: string | null;
}
/** Below the three-column breakpoint the reader is a modal bottom sheet. */
const sheetQuery = "(max-width: 1100px)";
function useSheetLayout(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia?.(sheetQuery);
      query?.addEventListener("change", notify);
      return () => query?.removeEventListener("change", notify);
    },
    () => window.matchMedia?.(sheetQuery).matches ?? false,
  );
}
function WorkspaceContent({
  session,
  onSwitch,
  api = knowledgeApi,
  authLoading = false,
  authError = null,
}: WorkspaceProps) {
  const { t, language } = useLanguage();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentsLoadedFor, setDocumentsLoadedFor] = useState<{
    session: Session;
    language: Language;
    api: KnowledgeApi;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<{ question: string } | null>(
    null,
  );
  const [mobileView, setMobileView] = useState<"sources" | "chat">("sources");
  const [mobileMotion, setMobileMotion] = useState(false);
  const [reader, setReader] = useState<
    | (SourceRequest & {
        request: number;
        document?: SourceDocument;
        failed?: boolean;
      })
    | null
  >(null);
  const [readerClosing, setReaderClosing] = useState(false);
  const documentGeneration = useRef(0);
  const readerRequest = useRef(0);
  const readerOpener = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const sheetLayout = useSheetLayout();
  /** Drops the open source and makes any in-flight source response stale. */
  const clearReader = useCallback(() => {
    readerRequest.current++;
    setReader(null);
    setReaderClosing(false);
  }, []);
  const closeReader = useCallback(() => {
    restoreFocus.current = true;
    clearReader();
  }, [clearReader]);
  /** The sheet leaves with an exit transition; the column closes at once. */
  const dismissReader = useCallback(() => {
    if (sheetLayout) setReaderClosing(true);
    else closeReader();
  }, [sheetLayout, closeReader]);
  useEffect(() => {
    // A pending exit must not outlive a switch between sheet and column.
    setReaderClosing(false);
  }, [sheetLayout]);
  useEffect(() => {
    if (reader || !restoreFocus.current) return;
    restoreFocus.current = false;
    readerOpener.current?.focus();
  }, [reader]);
  useEffect(() => {
    setSuggestion(null);
    setMessages([]);
    setError(null);
  }, [session, api]);
  useEffect(() => {
    const generation = ++documentGeneration.current;
    let active = true;
    setDocuments([]);
    setError(null);
    clearReader();
    const invalidate = () => {
      active = false;
      documentGeneration.current++;
    };
    setDocumentsLoadedFor(null);
    if (!session) {
      setLoading(false);
      return invalidate;
    }
    setLoading(true);
    api
      .loadDocuments(session.accessToken, language)
      .then((docs) => {
        if (active && generation === documentGeneration.current) {
          setDocuments(docs);
          setDocumentsLoadedFor({ session, language, api });
        }
      })
      .catch(() => {
        if (active && generation === documentGeneration.current)
          setError(
            "Documents are unavailable. Please check your connection and sign in again.",
          );
      })
      .finally(() => {
        if (active && generation === documentGeneration.current)
          setLoading(false);
      });
    return invalidate;
  }, [session, api, language, clearReader]);
  const departments = identities
    .filter((person) =>
      documents.some((doc) => doc.department === person.department),
    )
    .map((person) => person.department);
  const authorizedListing = Boolean(
    session &&
    documentsLoadedFor?.session === session &&
    documentsLoadedFor.language === language &&
    documentsLoadedFor.api === api,
  );
  const name = t(session?.name ?? "Guest");
  const access = identities
    .filter((person) => departments.includes(person.department))
    .map((person) => t(person.label))
    .join(" & ");
  const answered = messages.flatMap((message) => message.response ?? []);
  const costs = answered.flatMap((response) => response.cost_usd ?? []);
  const cost = costs.length
    ? costs.reduce((total, value) => total + value, 0)
    : null;
  const openSource = async (source: SourceRequest, opener: HTMLElement) => {
    if (!session || loading || !documents.some((doc) => doc.id === source.id)) {
      setError("This source is not available to your account.");
      return;
    }
    const generation = documentGeneration.current;
    const request = ++readerRequest.current;
    const current = () =>
      generation === documentGeneration.current &&
      request === readerRequest.current;
    readerOpener.current = opener;
    setReader({ ...source, request });
    setReaderClosing(false);
    try {
      const document = await api.openDocument(
        session.accessToken,
        source.id,
        language,
      );
      if (!current()) return;
      if (new URL(document.url).protocol !== "https:")
        throw new Error("Invalid source URL");
      setReader({ ...source, request, document });
    } catch {
      if (current()) setReader({ ...source, request, failed: true });
    }
  };
  const send = async (question: string) => {
    if (!session || !documents.length || busy) return false;
    // Shown at once; matched by identity so a cleared conversation stays clear.
    const pending: Message = { question };
    setMessages((current) => [...current, pending]);
    setBusy(true);
    setError(null);
    try {
      const response = await api.askQuestion(
        session.accessToken,
        question,
        language,
      );
      if (
        response.citations.some(
          (citation) =>
            !documents.some((doc) => doc.id === citation.document_id),
        )
      )
        throw new Error("Unknown citation");
      setMessages((current) =>
        current.map((message) =>
          message === pending ? { question, response } : message,
        ),
      );
      return true;
    } catch {
      setMessages((current) =>
        current.filter((message) => message !== pending),
      );
      setError(
        "An answer is unavailable right now. Please try your question again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const switchAccount = (department?: string) => {
    documentGeneration.current++;
    clearReader();
    setDocuments([]);
    setSuggestion(null);
    setMessages([]);
    setMobileMotion(false);
    setMobileView("sources");
    setError(null);
    void onSwitch(department);
  };
  const selectSuggestion = async (question: string) => {
    if (!authorizedListing || loading || !documents.length || busy) return;
    setSuggestion({ question });
    if (await send(question)) setSuggestion(null);
  };
  const readerDocument = documents.find((doc) => doc.id === reader?.id);
  // The background is usable again as soon as the sheet starts to leave.
  const sheetOpen =
    sheetLayout && !readerClosing && Boolean(reader && readerDocument);
  return (
    <div className="workspace" data-mobile-motion={mobileMotion}>
      <header
        className="brand-bar"
        data-mobile-active={mobileView === "sources"}
        inert={sheetOpen}
      >
        <a className="brand" href="/" aria-label={t("KnowledgeLLM home")}>
          <span className="brand-mark">
            <Terminal />
          </span>
          <span>KnowledgeLLM</span>
        </a>
        <LanguageSwitch />
        <IdentityPicker
          departments={departments}
          onSwitch={switchAccount}
          disabled={authLoading || (!session && !authConfigured)}
        />
      </header>
      <aside
        id="sources-panel"
        className="sidebar"
        data-mobile-panel="sources"
        data-mobile-active={mobileView === "sources"}
        inert={sheetOpen}
      >
        <DepartmentFolders
          documents={documents}
          onOpen={(id, opener) => {
            void openSource({ id }, opener);
          }}
          loading={loading}
          authorizedListing={authorizedListing}
          openedDocumentId={reader?.id ?? null}
        />
        <SystemMonitor answers={answered.length} cost={cost} />
      </aside>
      <main
        id="chat-panel"
        className="chat-area"
        data-mobile-panel="chat"
        data-mobile-active={mobileView === "chat"}
        inert={sheetOpen}
      >
        <ChatPanel
          documents={documents}
          name={name}
          departments={departments}
          signedIn={Boolean(session)}
          messages={messages}
          busy={busy}
          openedDocumentId={reader?.id ?? null}
          onNew={() => {
            clearReader();
            setSuggestion(null);
            setMessages([]);
            setError(null);
          }}
          onOpen={(source, opener) => {
            void openSource(source, opener);
          }}
        />
        <div className="workspace-notices">
          {!session && (
            <p role="status">
              <span className="desktop-copy">
                {t("Select a persona above to sign in.")}
              </span>
              <span className="mobile-copy">
                {t("Open Sources to select a persona and sign in.")}
              </span>
            </p>
          )}
          {(error || authError) && (
            <p role="alert" className="error-message">
              {t(error || authError || "")}
            </p>
          )}
          {authLoading && (
            <p role="status">{t("Connecting to your account…")}</p>
          )}
          {session && !loading && !documents.length && !error && (
            <p role="status">
              {t(
                "Your account has no document access. Contact your workspace administrator.",
              )}
            </p>
          )}
        </div>
        <SuggestedQuestions
          departments={departments.length ? departments : ["finance"]}
          busy={busy}
          disabled={!authorizedListing || loading || !documents.length}
          onSuggestion={(question) => void selectSuggestion(question)}
        />
        <Composer
          onSend={send}
          suggestion={suggestion}
          disabled={!session || loading || !documents.length}
          busy={busy}
          name={name.split(" ")[0]}
          access={access}
          sourceCount={documents.length}
        />
      </main>
      <SourceReader
        source={
          reader && readerDocument
            ? {
                ...reader,
                title: readerDocument.title,
                department: readerDocument.department,
              }
            : null
        }
        modal={sheetLayout}
        closing={readerClosing}
        onDismiss={dismissReader}
        onClose={closeReader}
      />
      <nav
        className="mobile-view-nav"
        data-active-view={mobileView}
        aria-label={t("Workspace views")}
        inert={sheetOpen}
      >
        {(
          [
            ["sources", "Sources", Folder],
            ["chat", "Chat", MessageSquare],
          ] as const
        ).map(([view, label, Icon]) => (
          <button
            key={view}
            className="mobile-view-button"
            type="button"
            aria-controls={`${view}-panel`}
            aria-pressed={mobileView === view}
            onClick={(event) => {
              setMobileMotion(event.detail > 0);
              setMobileView(view);
            }}
          >
            <Icon aria-hidden="true" size={20} />
            {t(label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
export function Workspace(props: WorkspaceProps) {
  return (
    <LanguageBoundary>
      <WorkspaceContent {...props} />
    </LanguageBoundary>
  );
}
function ConnectedApp() {
  const auth = useAuth();
  const handleSwitch = async (department?: string) => {
    if (department) {
      await auth.loginAsPersona(department);
    } else if (auth.session) {
      await auth.switchAccount();
    } else {
      await auth.login();
    }
  };
  return (
    <>
      <Workspace
        key={auth.session?.accessToken ?? "signed-out"}
        session={auth.session}
        onSwitch={handleSwitch}
        authLoading={auth.loading}
        authError={auth.error}
      />
      {auth.toast && (
        <Toast
          duration={2000}
          message={auth.toast.message}
          subtitle={auth.toast.subtitle}
          department={auth.toast.department}
          onClose={auth.clearToast}
        />
      )}
    </>
  );
}
export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ConnectedApp />
      </AuthProvider>
    </LanguageProvider>
  );
}
