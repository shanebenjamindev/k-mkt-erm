import { ACCESS_ROLES, WORK_TYPES, type TeamMemberInput } from "./types";

export function isMemberInput(value: unknown): value is TeamMemberInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const member = value as Record<string, unknown>;
  return typeof member.name === "string" && member.name.trim().length > 0
    && typeof member.role === "string" && member.role.trim().length > 0
    && typeof member.username === "string" && /^[a-zA-Z0-9._-]{3,64}$/.test(member.username.trim())
    && ACCESS_ROLES.includes(member.accessRole as TeamMemberInput["accessRole"])
    && (member.password === undefined || typeof member.password === "string")
    && (member.avatarUrl === undefined || typeof member.avatarUrl === "string")
    && WORK_TYPES.includes(member.workType as TeamMemberInput["workType"]);
}
