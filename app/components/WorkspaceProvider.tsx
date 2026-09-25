"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskInput, TeamMember, TeamMemberInput } from "../../lib/types";
import { requestJson } from "../../lib/client-request";
import { useAuth } from "./AuthProvider";

type WorkspaceContextValue = {
  tasks: Task[]; members: TeamMember[]; loading: boolean; loaded: boolean; error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: TaskInput) => Promise<Task>;
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<Task>;
  removeTask: (id: string) => Promise<void>;
  createMember: (input: TeamMemberInput) => Promise<TeamMember>;
  updateMember: (id: string, input: TeamMemberInput) => Promise<TeamMember>;
  removeMember: (id: string) => Promise<void>;
};
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const CHANGE_KEY = "k-mkt-workspace-changed";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, refresh: refreshAuth } = useAuth();
  const session = user && !user.mustChangePassword ? user.id : null;
  const activeSession = useRef(session);
  activeSession.current = session;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef(tasks);
  const revision = useRef(0);
  const fetching = useRef<AbortController | null>(null);
  const operations = useRef(new Map<string, Promise<unknown>>());
  const pending = useRef(0);
  const applyTasks = useCallback((next: Task[] | ((current: Task[]) => Task[])) => {
    tasksRef.current = typeof next === "function" ? next(tasksRef.current) : next;
    setTasks(tasksRef.current);
  }, []);

  const refresh = useCallback(async () => {
    if (!session || fetching.current || pending.current) return;
    const version = revision.current;
    const controller = new AbortController();
    fetching.current = controller;
    try {
      const [taskData, memberData] = await Promise.all([
        requestJson<{ tasks: Task[] }>("/api/tasks", { cache: "no-store", signal: controller.signal }),
        requestJson<{ members: TeamMember[] }>("/api/team", { cache: "no-store", signal: controller.signal })
      ]);
      if (controller.signal.aborted || activeSession.current !== session || revision.current !== version) return;
      applyTasks(taskData.tasks); setMembers(memberData.members); setLoaded(true); setError(null);
    } catch (cause) {
      if (!controller.signal.aborted && activeSession.current === session && revision.current === version) setError(cause instanceof Error ? cause.message : "Không thể tải workspace.");
    } finally {
      if (fetching.current === controller) fetching.current = null;
      if (activeSession.current === session && revision.current === version) setLoading(false);
    }
  }, [session, applyTasks]);

  useEffect(() => {
    revision.current++;
    fetching.current?.abort(); fetching.current = null;
    operations.current = new Map(); pending.current = 0;
    applyTasks([]); setMembers([]); setLoaded(false); setError(null); setLoading(Boolean(session) || authLoading);
    if (!authLoading) void refresh();
    const sync = () => { if (document.visibilityState === "visible") void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) sync(); };
    const timer = window.setInterval(sync, 30_000);
    window.addEventListener("focus", sync); window.addEventListener("online", sync);
    window.addEventListener("storage", storage); document.addEventListener("visibilitychange", sync);
    return () => {
      revision.current++; fetching.current?.abort(); fetching.current = null;
      window.clearInterval(timer); window.removeEventListener("focus", sync); window.removeEventListener("online", sync);
      window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", sync);
    };
  }, [session, authLoading, refresh, applyTasks]);

  const mutate = useCallback(<T,>(key: string, operation: () => Promise<T>): Promise<T> => {
    // One in-flight action per entity prevents duplicate submits and response reordering.
    if (operations.current.has(key)) return Promise.reject(new Error("Thao tác này đang được lưu. Vui lòng đợi một chút."));
    if (!session || activeSession.current !== session) return Promise.reject(new Error("Vui lòng đăng nhập lại."));
    const registry = operations.current;
    revision.current++; fetching.current?.abort(); fetching.current = null; pending.current++;
    const action = operation().finally(() => {
      registry.delete(key);
      if (activeSession.current !== session || operations.current !== registry) return;
      revision.current++; pending.current--; setLoading(false);
      try { localStorage.setItem(CHANGE_KEY, `${Date.now()}:${Math.random()}`); } catch { /* Polling remains available. */ }
      window.dispatchEvent(new Event("workspace:notifications-changed"));
      if (!pending.current) void refresh();
    });
    registry.set(key, action);
    return action;
  }, [session, refresh]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    tasks, members, loading, loaded, error, refresh,
    createTask: (input) => mutate("task:create", async () => {
      const { task } = await requestJson<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(input) });
      if (activeSession.current === session) applyTasks((current) => [...current.filter((item) => item.id !== task.id), task]);
      return task;
    }),
    updateTask: (id, input) => mutate(`task:${id}`, async () => {
      const previous = tasksRef.current.find((task) => task.id === id);
      if (input.status) applyTasks((current) => current.map((item) => item.id === id ? { ...item, status: input.status! } : item));
      try {
        const { task } = await requestJson<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
        if (activeSession.current === session) applyTasks((current) => current.map((item) => item.id === id ? task : item));
        return task;
      } catch (cause) {
        if (previous && activeSession.current === session) applyTasks((current) => current.map((item) => item.id === id ? previous : item));
        throw cause;
      }
    }),
    removeTask: (id) => mutate(`task:${id}`, async () => {
      await requestJson(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (activeSession.current === session) applyTasks((current) => current.filter((item) => item.id !== id));
    }),
    createMember: (input) => mutate("member:create", async () => {
      const { member } = await requestJson<{ member: TeamMember }>("/api/team", { method: "POST", body: JSON.stringify(input) });
      if (activeSession.current === session) setMembers((current) => [...current.filter((item) => item.id !== member.id), member]);
      return member;
    }),
    updateMember: (id, input) => mutate(`member:${id}`, async () => {
      const { member } = await requestJson<{ member: TeamMember }>(`/api/team/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
      if (activeSession.current === session) {
        setMembers((current) => current.map((item) => item.id === id ? member : item));
        await refreshAuth().catch(() => undefined);
      }
      return member;
    }),
    removeMember: (id) => mutate(`member:${id}`, async () => {
      await requestJson(`/api/team/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (activeSession.current === session) setMembers((current) => current.filter((item) => item.id !== id));
    })
  }), [tasks, members, loading, loaded, error, refresh, mutate, session, applyTasks, refreshAuth]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace phải được dùng bên trong WorkspaceProvider.");
  return value;
}
