import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "../lib/api";
import { signInWithPasskey, markSignedInWith } from "../lib/passkeys";

interface User {
  code: string;
  displayName: string;
  travelerId?: string;
  role?: string; // "planner" | "traveler"
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
  loginWithToken: (token: string, displayName: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Only show loading state if there's a token to verify.
  // No token = skip straight to login page (no intermediate null render).
  const [loading, setLoading] = useState(() => !!localStorage.getItem("wander_token"));

  useEffect(() => {
    const token = localStorage.getItem("wander_token");
    if (token) {
      api.get<User>("/auth/me")
        .then((u) => setUser(u))
        .catch((err: Error) => {
          // Only a real "not authorized" answer signs someone out (api.ts has already
          // cleared the token in that case). A weak signal, a timeout, or a check cut off
          // by a quick reload must not erase the sign-in — fall back to who we last saw here.
          if (err?.message === "Unauthorized") return;
          try {
            const cached = localStorage.getItem("wander_me");
            if (cached) setUser(JSON.parse(cached));
          } catch { /* unreadable cache — stay signed out of the UI, token kept for next try */ }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Keep a copy of who's signed in on this device, so a failed check on a weak signal
  // can fall back to it instead of showing the login screen.
  useEffect(() => {
    if (!user) return;
    try { localStorage.setItem("wander_me", JSON.stringify(user)); } catch { /* storage unavailable */ }
  }, [user]);

  async function login(code: string) {
    const res = await api.post<{ token: string; displayName: string; travelerId?: string; role?: string }>("/auth/login", { code });
    localStorage.setItem("wander_token", res.token);
    localStorage.setItem("wander_user", res.displayName);
    setUser({ code, displayName: res.displayName, travelerId: res.travelerId, role: res.role });
    markSignedInWith("name");
    // Record login event (best-effort)
    api.post("/auth/login-event", {}).catch(() => {});
  }

  async function loginWithPasskey() {
    const res = await signInWithPasskey();
    localStorage.setItem("wander_token", res.token);
    localStorage.setItem("wander_user", res.displayName);
    setUser({ code: res.displayName, displayName: res.displayName, travelerId: res.travelerId, role: res.role });
    markSignedInWith("passkey");
    api.post("/auth/login-event", {}).catch(() => {});
  }

  function loginWithToken(token: string, displayName: string) {
    localStorage.setItem("wander_token", token);
    localStorage.setItem("wander_user", displayName);
    markSignedInWith("link");
    // Refresh user data from /me to get travelerId and role
    api.get<User>("/auth/me")
      .then((u) => setUser(u))
      .catch(() => setUser({ code: displayName, displayName }));
    // Record login event (best-effort)
    api.post("/auth/login-event", {}).catch(() => {});
  }

  function logout() {
    localStorage.removeItem("wander_token");
    localStorage.removeItem("wander_user");
    localStorage.removeItem("wander_me");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPasskey, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
