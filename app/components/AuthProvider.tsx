"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "../../lib/auth-repository";
import { requestJson, RequestError } from "../../lib/client-request";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const revision = useRef(0);
  const authenticating = useRef(false);

  const refresh = useCallback(async () => {
    if (authenticating.current) return;
    const version = ++revision.current;
    try {
      let body: { user: SessionUser };
      try { body = await requestJson<{ user: SessionUser }>("/api/auth/me", { cache: "no-store" }); }
      catch (cause) {
        if (!(cause instanceof RequestError) || cause.status !== 401) throw cause;
        if (version !== revision.current) return;
        setUser(null);
        const setup = await requestJson<{ setupRequired: boolean }>("/api/auth/setup", { cache: "no-store" });
        if (version === revision.current) { setSetupRequired(setup.setupRequired); setError(null); }
        return;
      }
      if (version !== revision.current) return;
      setUser(body.user);
      setSetupRequired(false);
      setError(null);
    } catch (cause) {
      if (version === revision.current) setError(cause instanceof Error ? cause.message : "Không thể kiểm tra phiên đăng nhập.");
      throw cause;
    } finally { if (version === revision.current) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    return () => { revision.current++; };
  }, [refresh]);

  const authenticate = useCallback(async (url: string, input: object) => {
    if (authenticating.current) throw new Error("Yêu cầu đăng nhập đang được xử lý.");
    authenticating.current = true;
    const version = ++revision.current;
    try {
      const body = await requestJson<{ user: SessionUser }>(url, { method: "POST", body: JSON.stringify(input) });
      if (!body.user) throw new Error("Phản hồi đăng nhập không hợp lệ.");
      if (version === revision.current) { setUser(body.user); setSetupRequired(false); setError(null); }
      return body.user;
    } finally { authenticating.current = false; if (version === revision.current) setLoading(false); }
  }, []);

  const logout = useCallback(async () => {
    if (authenticating.current) throw new Error("Vui lòng đợi yêu cầu đăng nhập hoàn tất.");
    authenticating.current = true;
    const version = ++revision.current;
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      if (version === revision.current) { setUser(null); setError(null); setSetupRequired(false); }
    } finally { authenticating.current = false; }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, error, setupRequired, refresh, logout,
    login: (username, password) => authenticate("/api/auth/login", { username, password }),
    setup: (name, role, username, password) => authenticate("/api/auth/setup", { name, role, username, password })
  }), [user, loading, error, setupRequired, refresh, logout, authenticate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải được dùng bên trong AuthProvider.");
  return value;
}
