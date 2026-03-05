import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "../lib/api";

interface User {
  code: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wander_token");
    if (token) {
      api.get<User>("/auth/me")
        .then(setUser)
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
    const res = await api.post<{ token: string; displayName: string }>("/auth/login", { code });
    localStorage.setItem("wander_token", res.token);
    localStorage.setItem("wander_user", res.displayName);
    setUser({ code, displayName: res.displayName });
  }

  function logout() {
    localStorage.removeItem("wander_token");
    localStorage.removeItem("wander_user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
