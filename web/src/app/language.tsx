import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export type Language = "en" | "zh-TW";
const translations: Record<string, string> = {
  "Language selection": "語言選擇",
  "KnowledgeLLM home": "KnowledgeLLM 首頁",
  Guest: "訪客",
  "Signed-in user": "已登入使用者",
  Finance: "財務",
  Operations: "營運",
  People: "人資",
  Identity: "身分",
  "View as": "檢視身分",
  "Tap to switch": "點選切換",
  "AWS Cognito Verified": "AWS Cognito 已驗證",
  restricted: "受限",
  "Selecting a demo identity starts Cognito custom authentication. Access is limited to that persona's permitted sample documents.":
    "選擇示範身分會啟動 Cognito 自訂驗證。您只能存取該身分獲准使用的範例文件。",
  "Department folders": "部門資料夾",
  Sources: "來源",
  Chat: "聊天",
  "Workspace views": "工作區檢視",
  "PERSONA ACCESS": "身分權限",
  Loading: "讀取中",
  Unlocked: "已解鎖",
  "Cached Hit": "快取命中",
  "Ask KnowledgeLLM": "詢問 KnowledgeLLM",
  "03. Notebook studio": "03. 筆記工作室",
  Studio: "工作室",
  "Source context": "來源內容",
  "Authorized sources in this notebook": "此筆記中的授權來源",
  "Sign in to load authorized sources": "登入以載入授權來源",
  "Close Studio": "關閉工作室",
  "Suggested questions": "建議問題",
  "Select a persona above to sign in and use Studio.":
    "請選擇上方身分登入，即可使用工作室。",
  "Open Sources to select a persona and sign in.":
    "請開啟來源，選擇身分並登入。",
  Active: "使用中",
  "Access-scoped answers with source citations":
    "依存取權限回答，並附上來源引用",
  "New chat": "新對話",
  Conversation: "對話",
  "Try a question": "試問一個問題",
  "Extra examples use fictional personal data to demonstrate the guardrail.":
    "額外範例使用虛構個人資料，示範個人資料防護機制。",
  "suggested questions": "建議問題",
  "KnowledgeLLM assistant": "KnowledgeLLM 助理",
  "Source:": "來源：",
  "Checking your permitted sources…": "正在查詢您獲准使用的來源…",
  "Ask a question to start a conversation.": "提出問題以開始對話。",
  "Every answer starts with your permitted sources.":
    "每個回答皆以您獲准使用的來源為依據。",
  "Your question": "您的問題",
  "Sign in to ask KnowledgeLLM…": "登入後即可詢問 KnowledgeLLM…",
  "Send question": "傳送問題",
  "Protected documents · Sign-in required": "受保護的文件 · 需要登入",
  "System monitor": "系統監控",
  Session: "工作階段",
  "PII guardrail": "個人資料防護",
  "Token cost": "Token 費用",
  "Checking…": "檢查中…",
  "Check unavailable": "無法執行檢查",
  "Result unavailable": "無法取得結果",
  "Awaiting question": "等待提問",
  Unavailable: "無法取得",
  "No PII detected": "未偵測到個人資料",
  "Question PII blocked": "已阻擋問題中的個人資料",
  "Answer PII blocked": "已阻擋回答中的個人資料",
  "Source PII masked": "來源個人資料已遮蔽",
  "PII check completed": "個人資料檢查完成",
  "Not checked · Access denied": "未檢查 · 存取遭拒",
  "Not checked · Invalid question": "未檢查 · 問題無效",
  "Dismiss notification": "關閉通知",
  "Documents are unavailable. Please check your connection and sign in again.":
    "無法取得文件。請檢查網路連線並重新登入。",
  "This source is not available to your account.": "您的帳號無法存取此來源。",
  "Your browser blocked the source window. Allow pop-ups and retry.":
    "瀏覽器已封鎖來源視窗。請允許彈出式視窗後重試。",
  "The source could not be opened. Please try again.":
    "無法開啟來源，請再試一次。",
  "An answer is unavailable right now. Please try your question again.":
    "目前無法取得回答，請重新提問。",
  "Connecting to your account…": "正在連線至您的帳號…",
  "Sign in": "登入",
  "Use your Cognito username and password.":
    "請使用您的 Cognito 使用者名稱及密碼。",
  "Sign-in is not configured yet. Connect Cognito to unlock your workspace.":
    "尚未設定登入。請連接 Cognito 以啟用工作區。",
  "Your account has no document access. Contact your workspace administrator.":
    "您的帳號沒有文件存取權限。請聯絡工作區管理員。",
  "Your session expired. Sign in again to continue.":
    "您的工作階段已過期。請重新登入以繼續。",
  "Sign-in could not be completed. Please try again.":
    "無法完成登入，請再試一次。",
  "Sign-in is unavailable. Check the authentication setup.":
    "無法登入，請檢查驗證設定。",
  "Account switching is unavailable. Please try signing in again.":
    "無法切換帳號，請嘗試重新登入。",
  "Could not sign in with this persona. Please try again.":
    "無法使用此身分登入，請再試一次。",
  "Q4 budget overview": "第四季預算概覽",
  "Expense policy": "費用報銷政策",
  "Runbook & procedures": "操作手冊與程序",
  "Service handoff": "服務交接",
  "Employee handbook": "員工手冊",
  "Leave policy": "休假政策",
};
interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string) => string;
}
const LanguageContext = createContext<LanguageState | null>(null);
export function useLanguage(): LanguageState {
  return (
    useContext(LanguageContext) ?? {
      language: "en",
      setLanguage: () => {},
      t: (text) => text,
    }
  );
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return window.localStorage.getItem("knowledge-language") === "zh-TW"
        ? "zh-TW"
        : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.title =
      language === "zh-TW" ? "KnowledgeLLM · 知識工作區" : "KnowledgeLLM";
    try {
      window.localStorage.setItem("knowledge-language", language);
    } catch {
      /* Language switching still works when storage is unavailable. */
    }
  }, [language]);
  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: (text) =>
          language === "zh-TW" ? (translations[text] ?? text) : text,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
export function LanguageBoundary({ children }: { children: ReactNode }) {
  const existing = useContext(LanguageContext);
  return existing ? children : <LanguageProvider>{children}</LanguageProvider>;
}
export function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div
      className="lang-switch"
      role="group"
      aria-label={t("Language selection")}
    >
      {(
        [
          ["en", "EN"],
          ["zh-TW", "CH"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          className={`lang-option ${language === value ? "is-active" : ""}`}
          type="button"
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
