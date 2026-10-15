import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Department } from "../app/api";
import { identities } from "../components/IdentityPicker";
import {
  signIn,
  signInAsPersona,
  switchIdentity,
  userManager,
  type Session,
} from "./auth";

export interface ToastInfo {
  message: string;
  subtitle?: string;
  department?: Department;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  toast: ToastInfo | null;
  clearToast: () => void;
  login: () => Promise<void>;
  loginAsPersona: (department: string) => Promise<void>;
  switchAccount: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
let restoration: Promise<Session | null> | undefined;
async function restoreSession(): Promise<Session | null> {
  const directSessionStr = sessionStorage.getItem("knowledge-direct-session");
  if (directSessionStr !== null) {
    try {
      const stored: unknown = JSON.parse(directSessionStr);
      if (
        typeof stored === "object" &&
        stored !== null &&
        "accessToken" in stored &&
        typeof stored.accessToken === "string" &&
        stored.accessToken &&
        "name" in stored &&
        typeof stored.name === "string" &&
        stored.name &&
        "expiresAt" in stored &&
        typeof stored.expiresAt === "number" &&
        Number.isSafeInteger(stored.expiresAt) &&
        stored.expiresAt > Date.now()
      ) {
        return {
          accessToken: stored.accessToken,
          name: stored.name,
          expiresAt: stored.expiresAt,
        };
      }
      sessionStorage.removeItem("knowledge-direct-session");
    } catch {
      sessionStorage.removeItem("knowledge-direct-session");
    }
  }
  if (!userManager) return null;
  if (sessionStorage.getItem("knowledge-account-switch")) {
    sessionStorage.removeItem("knowledge-account-switch");
    await signIn();
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const callback = params.has("code") || params.has("error");
  try {
    const user = callback
      ? await userManager.signinRedirectCallback()
      : await userManager.getUser();
    return user && !user.expired
      ? {
          accessToken: user.access_token,
          name:
            user.profile.name ??
            user.profile.preferred_username ??
            "Signed-in user",
        }
      : null;
  } finally {
    if (callback) window.history.replaceState({}, "", window.location.pathname);
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(userManager));
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const authAttempt = useRef(0);

  const clearToast = () => setToast(null);

  useEffect(() => {
    let active = true;
    const attempt = authAttempt.current;
    restoration ??= restoreSession().finally(() => {
      restoration = undefined;
    });
    restoration
      .then((value) => {
        if (active && attempt === authAttempt.current) setSession(value);
      })
      .catch(() => {
        if (active && attempt === authAttempt.current)
          setError("Sign-in could not be completed. Please try again.");
      })
      .finally(() => {
        if (active && attempt === authAttempt.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!userManager || !session || session.expiresAt !== undefined) return;
    const expire = () => {
      setSession(null);
      setToast(null);
      setError("Your session expired. Sign in again to continue.");
    };
    userManager.events.addAccessTokenExpired(expire);
    return () => userManager?.events.removeAccessTokenExpired(expire);
  }, [session]);
  useEffect(() => {
    if (session?.expiresAt === undefined) return;
    const expiresAt = session.expiresAt;
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      clearTimeout(timer);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        sessionStorage.removeItem("knowledge-direct-session");
        setSession(null);
        setToast(null);
        setError("Your session expired. Sign in again to continue.");
      } else {
        timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
      }
    };
    checkExpiry();
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [session]);
  const login = async () => {
    try {
      await signIn();
    } catch {
      setError("Sign-in is unavailable. Check the authentication setup.");
    }
  };
  const switchAccount = async () => {
    authAttempt.current += 1;
    setSession(null);
    setToast(null);
    setLoading(true);
    restoration = undefined;
    try {
      await switchIdentity();
    } catch {
      setLoading(false);
      setError(
        "Account switching is unavailable. Please try signing in again.",
      );
    }
  };
  const loginAsPersona = async (department: string) => {
    authAttempt.current += 1;
    setSession(null);
    setToast(null);
    setLoading(true);
    setError(null);
    try {
      const newSession = await signInAsPersona(department);
      setSession(newSession);
      const persona = identities.find((p) => p.department === department);
      const shortName = persona ? persona.name : newSession.name.split(" ")[0];
      setToast({
        message: `${shortName} signed in successfully`,
        subtitle: "AWS Cognito Verified",
        department: department as Department,
      });
    } catch {
      setError("Could not sign in with this persona. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        toast,
        clearToast,
        login,
        loginAsPersona,
        switchAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required.");
  return auth;
}
