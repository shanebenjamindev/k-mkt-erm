import type { AccessRole } from "./types";

export type PermissionAction =
  | "project.settings.update"
  | "member.invite"
  | "member.manage"
  | "drive.upload"
  | "drive.manage"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "brief.create"
  | "brief.edit"
  | "notification.read";

export type PermissionSubject = { accessRole: AccessRole; mustChangePassword?: boolean } | null | undefined;

const administratorActions = new Set<PermissionAction>([
  "project.settings.update",
  "member.invite",
  "member.manage",
  "drive.upload",
  "drive.manage"
]);

/** Server routes and client navigation share the permissions supported by the current role schema. */
export function can(subject: PermissionSubject, action: PermissionAction): boolean {
  if (!subject || subject.mustChangePassword) return false;
  if (administratorActions.has(action)) return subject.accessRole === "admin";
  return subject.accessRole === "admin" || subject.accessRole === "employee";
}
