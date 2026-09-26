import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PushSubscriptionRecord, TeamMember, Task, WorkspaceNotification } from "./types";
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from "./project-settings";
import { normalizeBriefImages } from "./brief-images";

export type StoredMember = TeamMember & { passwordHash: string };
export type StoredSession = { tokenHash: string; memberId: string; expiresAt: string };
export type WorkspaceData = { tasks: Task[]; members: StoredMember[]; sessions: StoredSession[]; notifications: WorkspaceNotification[]; pushSubscriptions: PushSubscriptionRecord[]; settings: ProjectSettings };

const storePath = path.join(process.cwd(), ".data", "workspace.json");
type Transaction = { data?: WorkspaceData; dirty: boolean };
// Share the queue across Next route bundles in the local development process.
const globalStore = globalThis as typeof globalThis & {
  kMktStore?: { queue: Promise<unknown>; context: AsyncLocalStorage<Transaction> };
};
const coordinator = globalStore.kMktStore ??= { queue: Promise.resolve(), context: new AsyncLocalStorage<Transaction>() };

function emptyWorkspace(): WorkspaceData {
  return { tasks: [], members: [], sessions: [], notifications: [], pushSubscriptions: [], settings: DEFAULT_PROJECT_SETTINGS };
}

function normalizeWorkspace(data: WorkspaceData): WorkspaceData {
  return {
    sessions: data.sessions ?? [],
    notifications: data.notifications ?? [],
    pushSubscriptions: data.pushSubscriptions ?? [],
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...(data.settings ?? {}) },
    members: data.members.map((member) => ({
      ...member,
      avatarUrl: member.avatarUrl || undefined,
      mustChangePassword: member.mustChangePassword ?? true
    })),
    tasks: data.tasks.map((task) => {
      const { durationMinutes: _durationMinutes, code: _legacyCode, ...withoutLegacyFields } = task as Task & { durationMinutes?: unknown; code?: unknown };
      const startTime = task.startTime || "09:00";
      const endTime = task.endTime || ({ "09:00": "11:00", "11:00": "13:00", "13:00": "15:00", "15:00": "17:00", "17:00": "19:00" }[startTime] ?? "19:00");
      const assigneeIds = Array.isArray(task.assigneeIds)
        ? task.assigneeIds.filter((id) => data.members.some((member) => member.id === id))
        : data.members.filter((member) => member.name === task.owner).map((member) => member.id);
      const owner = assigneeIds.map((id) => data.members.find((member) => member.id === id)?.name).filter(Boolean).join(", ") || "Chưa phân công";
      return { ...withoutLegacyFields, assigneeIds, owner, briefUrl: task.briefUrl ?? null, briefFinalUrl: task.briefFinalUrl ?? null, briefImages: normalizeBriefImages(task.briefImages), linkedBriefIds: task.linkedBriefIds ?? [], startDate: task.startDate || task.deadline || null, startTime, endTime,
        reminderDate: task.reminderDate ?? null, reminderTime: task.reminderTime ?? null, reminderRepeat: task.reminderRepeat ?? "none", reminderOffsets: task.reminderOffsets ?? [] };
    })
  };
}

export async function readWorkspace(): Promise<WorkspaceData> {
  const transaction = coordinator.context.getStore();
  if (transaction?.data) return transaction.data;
  let data: WorkspaceData;
  try {
    const value = await readFile(storePath, "utf8");
    const parsed = JSON.parse(value) as Partial<WorkspaceData>;
    if (Array.isArray(parsed.tasks) && Array.isArray(parsed.members) && Array.isArray(parsed.sessions)) {
      data = normalizeWorkspace(parsed as WorkspaceData);
    } else {
      throw new Error("Dữ liệu workspace không hợp lệ. Vui lòng kiểm tra bản sao lưu.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    data = emptyWorkspace();
  }
  if (transaction) transaction.data = data;
  return data;
}

export async function writeWorkspace(data: WorkspaceData) {
  const transaction = coordinator.context.getStore();
  if (transaction) {
    transaction.data = data;
    transaction.dirty = true;
    return;
  }
  await withWorkspaceTransaction(async () => { await writeWorkspace(data); });
}

async function commitWorkspace(data: WorkspaceData) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporary = `${storePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await rename(temporary, storePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Serialize a complete local read/modify/write operation, committing only on success. */
export function withWorkspaceTransaction<T>(operation: () => Promise<T>): Promise<T> {
  if (coordinator.context.getStore()) return operation();
  const pending = coordinator.queue.then(() => coordinator.context.run({ dirty: false }, async () => {
    const result = await operation();
    const transaction = coordinator.context.getStore()!;
    if (transaction.dirty && transaction.data) await commitWorkspace(transaction.data);
    return result;
  }));
  coordinator.queue = pending.catch(() => undefined);
  return pending;
}
