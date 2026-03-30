import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "../lib/api";

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
        .catch(() => {
          localStorage.removeItem("wander_token");
          localStorage.removeItem("wander_user");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(code: string) {
    const res = await api.post<{ token: string; displayName: string; travelerId?: string; role?: string }>("/auth/login", { code });
    localStorage.setItem("wander_token", res.token);
    localStorage.setItem("wander_user", res.displayName);
    setUser({ code, displayName: res.displayName, travelerId: res.travelerId, role: res.role });
    // Record login event (best-effort)
    api.post("/auth/login-event", {}).catch(() => {});
  }

  function loginWithToken(token: string, displayName: string) {
    localStorage.setItem("wander_token", token);
    localStorage.setItem("wander_user", displayName);
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
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
