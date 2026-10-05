import { useEffect, useState } from "react";
import { LogIn, Terminal, UserRound } from "lucide-react";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import type { Session } from "../auth/auth";
import { authConfigured } from "./config";
import { knowledgeApi, type DocumentSummary, type KnowledgeApi } from "./api";
import { IdentityPicker, identities } from "../components/IdentityPicker";
import { DepartmentFolders } from "../components/DepartmentFolders";
import { ChatPanel, type Message } from "../components/ChatPanel";
import { Composer } from "../components/Composer";
import { SystemMonitor } from "../components/SystemMonitor";
import "../styles/tokens.css";
import "../styles/app.css";
interface WorkspaceProps {
  session: Session | null;
  onSwitch: () => Promise<void>;
  api?: KnowledgeApi;
  authLoading?: boolean;
  authError?: string | null;
}
export function Workspace({
  session,
  onSwitch,
  api = knowledgeApi,
  authLoading = false,
  authError = null,
}: WorkspaceProps) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setDocuments([]);
    setMessages([]);
    setCost(null);
    setError(null);
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .loadDocuments(session.accessToken)
      .then((docs) => {
        if (active) setDocuments(docs);
      })
      .catch(() => {
        if (active)
          setError(
            "Documents are unavailable. Please check your connection and sign in again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, api]);
  const departments = identities
    .filter((person) =>
      documents.some((doc) => doc.department === person.department),
    )
    .map((person) => person.department);
  const name = session?.name ?? "Guest";
  const access = identities
    .filter((person) => departments.includes(person.department))
    .map((person) => person.label)
    .join(" & ");
  const openDocument = async (id: string) => {
    if (!session || !documents.some((doc) => doc.id === id)) {
      setError("This source is not available to your account.");
      return;
    }
    try {
      await api.openDocument(session.accessToken, id);
    } catch {
      setError("The source could not be opened. Please try again.");
    }
  };
  const send = async (question: string) => {
    if (!session || !documents.length || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const response = await api.askQuestion(session.accessToken, question);
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
          ? null
          : (current ?? 0) + response.cost_usd,
      );
      return true;
    } catch {
      setError(
        "An answer is unavailable right now. Please try your question again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const switchAccount = () => {
    setDocuments([]);
    setMessages([]);
    setCost(null);
    setError(null);
    void onSwitch();
  };
  return (
    <div className="workspace">
      <header className="brand-bar">
        <a className="brand" href="/" aria-label="KnowledgeLLM home">
          <span className="brand-mark">
            <Terminal />
          </span>
          <span>KnowledgeLLM</span>
        </a>
        <IdentityPicker
          departments={departments}
          onSwitch={switchAccount}
          disabled={authLoading || (!session && !authConfigured)}
        />
        <button
          className="account-button"
          aria-label={
            session ? "Switch signed-in account" : "Sign in to your account"
          }
          onClick={switchAccount}
          disabled={authLoading || (!session && !authConfigured)}
        >
          <UserRound />
        </button>
      </header>
      <aside className="sidebar">
        <DepartmentFolders
          documents={documents}
          onOpen={(id) => {
            void openDocument(id);
          }}
          loading={loading}
        />
        <div className="desktop-monitor">
          <SystemMonitor cost={cost} receivedAnswer={messages.length > 0} />
        </div>
      </aside>
      <main className="chat-area">
        <ChatPanel
          name={name}
          departments={departments}
          signedIn={Boolean(session)}
          messages={messages}
          busy={busy}
          onNew={() => {
            setMessages([]);
            setCost(null);
            setError(null);
          }}
          onOpen={(id) => {
            void openDocument(id);
          }}
        />
        <div className="workspace-notices">
          {(error || authError) && (
            <p role="alert" className="error-message">
              {error || authError}
            </p>
          )}
          {authLoading && <p role="status">Connecting to your account…</p>}
          {!session && !authLoading && (
            <div className="login-notice">
              <button
                className="sign-in"
                onClick={switchAccount}
                disabled={!authConfigured}
              >
                <LogIn size={18} />
                Sign in
              </button>
              <p>
                {authConfigured
                  ? "Use your Cognito username and password."
                  : "Sign-in is not configured yet. Connect Cognito to unlock your workspace."}
              </p>
            </div>
          )}
          {session && !loading && !documents.length && !error && (
            <p role="status">
              Your account has no document access. Contact your workspace
              administrator.
            </p>
          )}
        </div>
        <div className="mobile-monitor">
          <SystemMonitor cost={cost} receivedAnswer={messages.length > 0} />
        </div>
        <Composer
          onSend={send}
          disabled={!session || loading || !documents.length}
          busy={busy}
          name={name.split(" ")[0]}
          access={access}
        />
      </main>
    </div>
  );
}
function ConnectedApp() {
  const auth = useAuth();
  return (
    <Workspace
      key={auth.session?.accessToken ?? "signed-out"}
      session={auth.session}
      onSwitch={auth.session ? auth.switchAccount : auth.login}
      authLoading={auth.loading}
      authError={auth.error}
    />
  );
}
export default function App() {
  return (
    <AuthProvider>
      <ConnectedApp />
    </AuthProvider>
  );
}
