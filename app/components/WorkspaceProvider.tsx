"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Task, TaskInput, TeamMember, TeamMemberInput } from "../../lib/types";
import { useAuth } from "./AuthProvider";

type WorkspaceContextValue = {
  tasks: Task[];
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: TaskInput) => Promise<Task>;
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<Task>;
  removeTask: (id: string) => Promise<void>;
  createMember: (input: TeamMemberInput) => Promise<TeamMember>;
  updateMember: (id: string, input: TeamMemberInput) => Promise<TeamMember>;
  removeMember: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Yêu cầu không thành công.");
  return body;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setMembers([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [taskData, memberData] = await Promise.all([
        request<{ tasks: Task[] }>("/api/tasks"),
        request<{ members: TeamMember[] }>("/api/team")
      ]);
      setTasks(taskData.tasks);
      setMembers(memberData.members);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kết nối dữ liệu workspace.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (!authLoading) void refresh(); }, [authLoading, refresh]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    tasks, members, loading, error, refresh,
    createTask: async (input) => {
      const { task } = await request<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(input) });
      setTasks((current) => [...current, task].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")));
      return task;
    },
    updateTask: async (id, input) => {
      const { task } = await request<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
      setTasks((current) => current.map((item) => item.id === id ? task : item));
      return task;
    },
    removeTask: async (id) => {
      await request<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item.id !== id));
    },
    createMember: async (input) => {
      const { member } = await request<{ member: TeamMember }>("/api/team", { method: "POST", body: JSON.stringify(input) });
      setMembers((current) => [...current, member].sort((a, b) => a.name.localeCompare(b.name, "vi")));
      return member;
    },
    updateMember: async (id, input) => {
      const { member } = await request<{ member: TeamMember }>(`/api/team/${id}`, { method: "PATCH", body: JSON.stringify(input) });
      await Promise.all([refresh(), refreshAuth()]);
      return member;
    },
    removeMember: async (id) => {
      await request<{ ok: true }>(`/api/team/${id}`, { method: "DELETE" });
      await refresh();
    }
  }), [tasks, members, loading, error, refresh, refreshAuth]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace phải được dùng bên trong WorkspaceProvider.");
  return value;
}
