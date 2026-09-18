import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PushSubscriptionRecord, TeamMember, Task, WorkspaceNotification } from "./types";

export type StoredMember = TeamMember & { passwordHash: string };
export type StoredSession = { tokenHash: string; memberId: string; expiresAt: string };
export type WorkspaceData = { tasks: Task[]; members: StoredMember[]; sessions: StoredSession[]; notifications: WorkspaceNotification[]; pushSubscriptions: PushSubscriptionRecord[] };

const storePath = path.join(process.cwd(), ".data", "workspace.json");

function emptyWorkspace(): WorkspaceData {
  return { tasks: [], members: [], sessions: [], notifications: [], pushSubscriptions: [] };
}

function normalizeWorkspace(data: WorkspaceData): WorkspaceData {
  return {
    sessions: data.sessions ?? [],
    notifications: data.notifications ?? [],
    pushSubscriptions: data.pushSubscriptions ?? [],
    members: data.members.map((member) => ({
      ...member,
      avatarUrl: member.avatarUrl || undefined,
      mustChangePassword: member.mustChangePassword ?? true
    })),
    tasks: data.tasks.map((task) => {
      const { durationMinutes: _durationMinutes, ...withoutDuration } = task as Task & { durationMinutes?: unknown };
      return { ...withoutDuration, startDate: task.startDate || task.deadline || null, startTime: task.startTime || "09:00" };
    })
  };
}

export async function readWorkspace(): Promise<WorkspaceData> {
  try {
    const value = await readFile(storePath, "utf8");
    const parsed = JSON.parse(value) as Partial<WorkspaceData>;
    if (Array.isArray(parsed.tasks) && Array.isArray(parsed.members) && Array.isArray(parsed.sessions)) {
      return normalizeWorkspace(parsed as WorkspaceData);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const initial = emptyWorkspace();
  await writeWorkspace(initial);
  return initial;
}

export async function writeWorkspace(data: WorkspaceData) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2), "utf8");
}
