import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { signIn, switchIdentity, userManager, type Session } from "./auth";
interface AuthState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  switchAccount: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
let restoration: Promise<Session | null> | undefined;
async function restoreSession(): Promise<Session | null> {
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
  useEffect(() => {
    if (!userManager) return;
    let active = true;
    const expire = () => {
      setSession(null);
      setError("Your session expired. Sign in again to continue.");
    };
    userManager.events.addAccessTokenExpired(expire);
    restoration ??= restoreSession();
    restoration
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active)
          setError("Sign-in could not be completed. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      userManager?.events.removeAccessTokenExpired(expire);
    };
  }, []);
  const login = async () => {
    try {
      await signIn();
    } catch {
      setError("Sign-in is unavailable. Check the authentication setup.");
    }
  };
  const switchAccount = async () => {
    setSession(null);
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
  return (
    <AuthContext.Provider
      value={{ session, loading, error, login, switchAccount }}
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
