import {
  LanguageBoundary,
  LanguageProvider,
  LanguageSwitch,
  useLanguage,
  type Language,
} from "./language";
import { useEffect, useRef, useState } from "react";
import { Folder, MessageSquare, Sparkles, Terminal } from "lucide-react";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import type { Session } from "../auth/auth";
import { authConfigured } from "./config";
import { knowledgeApi, type DocumentSummary, type KnowledgeApi } from "./api";
import { IdentityPicker, identities } from "../components/IdentityPicker";
import { DepartmentFolders } from "../components/DepartmentFolders";
import { ChatPanel, type Message } from "../components/ChatPanel";
import { Composer } from "../components/Composer";
import { SystemMonitor } from "../components/SystemMonitor";
import { SuggestedQuestions } from "../components/SuggestedQuestions";
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
  const [chatFailed, setChatFailed] = useState(false);
  const [suggestion, setSuggestion] = useState<{ question: string } | null>(
    null,
  );
  const [cost, setCost] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"sources" | "chat" | "studio">(
    "sources",
  );
  const [mobileMotion, setMobileMotion] = useState(false);
  const [openedDocumentId, setOpenedDocumentId] = useState<string | null>(null);
  const documentGeneration = useRef(0);
  const pendingSourceWindows = useRef(new Set<Window>());
  useEffect(() => {
    setSuggestion(null);
    setMessages([]);
    setChatFailed(false);
    setCost(null);
    setError(null);
    setOpenedDocumentId(null);
  }, [session, api]);
  useEffect(() => {
    const generation = ++documentGeneration.current;
    let active = true;
    setDocuments([]);
    setError(null);
    const invalidate = () => {
      active = false;
      documentGeneration.current++;
      pendingSourceWindows.current.forEach((source) => source.close());
      pendingSourceWindows.current.clear();
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
  }, [session, api, language]);
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
  const openDocument = async (id: string) => {
    if (!session || loading || !documents.some((doc) => doc.id === id)) {
      setError("This source is not available to your account.");
      return;
    }
    const sourceWindow = window.open("about:blank", "_blank");
    if (!sourceWindow) {
      setError(
        "Your browser blocked the source window. Allow pop-ups and retry.",
      );
      return;
    }
    sourceWindow.opener = null;
    const generation = documentGeneration.current;
    pendingSourceWindows.current.add(sourceWindow);
    try {
      const url = await api.openDocument(session.accessToken, id, language);
      if (generation !== documentGeneration.current) return;
      if (new URL(url).protocol !== "https:")
        throw new Error("Invalid source URL");
      sourceWindow.location.replace(url);
      setOpenedDocumentId(id);
    } catch {
      sourceWindow.close();
      if (generation === documentGeneration.current)
        setError("The source could not be opened. Please try again.");
    } finally {
      pendingSourceWindows.current.delete(sourceWindow);
    }
  };
  const send = async (question: string) => {
    if (!session || !documents.length || busy) return false;
    setBusy(true);
    setChatFailed(false);
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
      setMessages((current) => [...current, { question, response }]);
      setCost((current) =>
        response.cost_usd === undefined
          ? current
          : (current ?? 0) + response.cost_usd,
      );
      return true;
    } catch {
      setChatFailed(true);
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
    pendingSourceWindows.current.forEach((source) => source.close());
    pendingSourceWindows.current.clear();
    setDocuments([]);
    setSuggestion(null);
    setMessages([]);
    setChatFailed(false);
    setCost(null);
    setOpenedDocumentId(null);
    setMobileMotion(false);
    setMobileView("sources");
    setError(null);
    void onSwitch(department);
  };
  const selectSuggestion = async (question: string) => {
    if (!authorizedListing || loading || !documents.length || busy) return;
    setSuggestion({ question });
    setMobileMotion(false);
    setMobileView("chat");
    if (await send(question)) setSuggestion(null);
  };
  return (
    <div className="workspace" data-mobile-motion={mobileMotion}>
      <header
        className="brand-bar"
        data-mobile-active={mobileView === "sources"}
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
      >
        <DepartmentFolders
          documents={documents}
          onOpen={(id) => {
            void openDocument(id);
          }}
          loading={loading}
          authorizedListing={authorizedListing}
          openedDocumentId={openedDocumentId}
        />
        <div className="desktop-monitor">
          <SystemMonitor
            cost={cost}
            receivedAnswer={messages.length > 0}
            guardrailAction={messages.at(-1)?.response.guardrail_action}
            busy={busy}
            failed={chatFailed}
          />
        </div>
      </aside>
      <aside
        id="suggestions-panel"
        className="suggestion-rail"
        data-mobile-panel="studio"
        data-mobile-active={mobileView === "studio"}
        aria-labelledby="suggestions-title"
      >
        <div className="suggestion-heading">
          <div>
            <h2 id="suggestions-title">{t("Studio")}</h2>
            <p>{t("Suggested questions")}</p>
          </div>
        </div>
        {!session && (
          <p role="status" className="guardrail-note">
            <span className="desktop-copy">
              {t("Select a persona above to sign in and use Studio.")}
            </span>
            <span className="mobile-copy">
              {t("Open Sources to select a persona and sign in.")}
            </span>
          </p>
        )}
        <SuggestedQuestions
          departments={departments.length ? departments : ["finance"]}
          busy={busy}
          disabled={!authorizedListing || loading || !documents.length}
          onSuggestion={(question) => void selectSuggestion(question)}
        />
      </aside>
      <main
        id="chat-panel"
        className="chat-area"
        data-mobile-panel="chat"
        data-mobile-active={mobileView === "chat"}
      >
        <ChatPanel
          documents={documents}
          name={name}
          departments={departments}
          signedIn={Boolean(session)}
          messages={messages}
          busy={busy}
          onNew={() => {
            setSuggestion(null);
            setMessages([]);
            setChatFailed(false);
            setCost(null);
            setError(null);
          }}
          onOpen={(id) => {
            void openDocument(id);
          }}
        />
        <div className="workspace-notices">
          {!session && (
            <p className="mobile-copy" role="status">
              {t("Open Sources to select a persona and sign in.")}
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
        <Composer
          onSend={send}
          suggestion={suggestion}
          disabled={!session || loading || !documents.length}
          busy={busy}
          name={name.split(" ")[0]}
          access={access}
        />
        <div className="mobile-monitor">
          <SystemMonitor
            cost={cost}
            receivedAnswer={messages.length > 0}
            guardrailAction={messages.at(-1)?.response.guardrail_action}
            busy={busy}
            failed={chatFailed}
          />
        </div>
      </main>
      <nav
        className="mobile-view-nav"
        data-active-view={mobileView}
        aria-label={t("Workspace views")}
      >
        {(
          [
            ["sources", "Sources", Folder],
            ["chat", "Chat", MessageSquare],
            ["studio", "Studio", Sparkles],
          ] as const
        ).map(([view, label, Icon]) => (
          <button
            key={view}
            className="mobile-view-button"
            type="button"
            aria-controls={
              view === "studio" ? "suggestions-panel" : `${view}-panel`
            }
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
