"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../../lib/auth-repository";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  setupRequired: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  setup: (name: string, role: string, username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.status === 401) {
        setUser(null);
        const setupResponse = await fetch("/api/auth/setup", { cache: "no-store" });
        const setup = await setupResponse.json() as { setupRequired?: boolean };
        setSetupRequired(Boolean(setup.setupRequired));
        return;
      }
      const body = await response.json() as { user?: SessionUser; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không thể kiểm tra phiên đăng nhập.");
      setUser(body.user ?? null);
      setSetupRequired(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, setupRequired, refresh,
    login: async (username, password) => {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const body = await response.json() as { user?: SessionUser; error?: string; setupRequired?: boolean };
      if (!response.ok || !body.user) {
        if (body.setupRequired) setSetupRequired(true);
        throw new Error(body.error ?? "Không thể đăng nhập.");
      }
      setUser(body.user);
      setSetupRequired(false);
      return body.user;
    },
    setup: async (name, role, username, password) => {
      const response = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role, username, password }) });
      const body = await response.json() as { user?: SessionUser; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error ?? "Không thể khởi tạo workspace.");
      setUser(body.user);
      setSetupRequired(false);
      return body.user;
    },
    logout: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    }
  }), [user, loading, setupRequired, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải được dùng bên trong AuthProvider.");
  return value;
}
