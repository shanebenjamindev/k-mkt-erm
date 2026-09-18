import { randomBytes } from "node:crypto";
import { hashPassword, hashToken, verifyPassword } from "./password";
import { createSupabaseAuthClient, hasSupabaseBackend, supabaseAdmin } from "./supabase-admin";
import { readWorkspace, writeWorkspace, type StoredMember } from "./workspace-store";
import { initialsFor, type AccessRole, type TeamMemberInput, type WorkType } from "./types";

export const SESSION_COOKIE = "k_mkt_session";
export const SESSION_REFRESH_COOKIE = "k_mkt_refresh";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  accessRole: AccessRole;
  avatarUrl?: string;
  mustChangePassword: boolean;
  initials: string;
};

const normalizeUsername = (username: string) => username.trim().toLocaleLowerCase();
const usernameEmail = (username: string) => `${normalizeUsername(username)}@accounts.k-mkt.local`;

type SupabaseMemberRow = {
  id: string;
  name: string;
  role: string;
  username: string;
  access_role: AccessRole;
  avatar_url: string | null;
  must_change_password: boolean;
  initials: string;
};

const toSupabaseUser = (member: SupabaseMemberRow): SessionUser => ({
  id: member.id,
  username: member.username,
  name: member.name,
  role: member.role,
  accessRole: member.access_role,
  avatarUrl: member.avatar_url ?? undefined,
  mustChangePassword: member.must_change_password,
  initials: member.initials
});

async function getSupabaseProfile(id: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from("team_members").select("id, name, role, username, access_role, avatar_url, must_change_password, initials").eq("id", id).maybeSingle();
  if (error) throw new Error(`Không thể đọc hồ sơ Supabase: ${error.message}`);
  return data as SupabaseMemberRow | null;
}
const toLocalUser = (member: StoredMember): SessionUser => ({
  id: member.id,
  username: member.username,
  name: member.name,
  role: member.role,
  accessRole: member.accessRole,
  avatarUrl: member.avatarUrl,
  mustChangePassword: member.mustChangePassword,
  initials: member.initials
});

export async function hasWorkspaceUsers() {
  if (hasSupabaseBackend && supabaseAdmin) {
    const { count, error, status } = await supabaseAdmin.from("team_members").select("id", { count: "exact", head: true });
    if (error) {
      if (status === 401 || !error.message) throw new Error("Không thể xác thực Supabase. Hãy kiểm tra SUPABASE_SECRET_KEY trên Vercel có đúng project và chưa bị thay mới.");
      throw new Error(`Không thể kiểm tra workspace Supabase: ${error.message}`);
    }
    return (count ?? 0) > 0;
  }
  return (await readWorkspace()).members.length > 0;
}

export async function createFirstAccount(input: Pick<TeamMemberInput, "name" | "role" | "username" | "avatarUrl"> & { password: string; workType?: WorkType }) {
  const name = input.name.trim();
  const username = normalizeUsername(input.username);
  if (!name || !username || !input.password) throw new Error("Vui lòng nhập đủ thông tin tài khoản.");
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error("Username chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
  if (input.password.length < 8) throw new Error("Mật khẩu phải có ít nhất 8 ký tự.");

  if (hasSupabaseBackend && supabaseAdmin) {
    if (await hasWorkspaceUsers()) throw new Error("Không thể khởi tạo lại workspace đã có người dùng.");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: usernameEmail(username), password: input.password, email_confirm: true
    });
    if (createError || !created.user) throw new Error(createError?.message ?? "Không thể tạo tài khoản Supabase.");
    const row = {
      id: created.user.id, name, role: input.role.trim() || "Quản trị workspace", work_type: input.workType ?? "inhouse",
      username, access_role: "admin" as const, avatar_url: input.avatarUrl?.startsWith("data:image/") ? input.avatarUrl : null,
      must_change_password: true, initials: initialsFor(name)
    };
    const { error: profileError } = await supabaseAdmin.from("team_members").insert(row);
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(`Không thể tạo hồ sơ Supabase: ${profileError.message}`);
    }
    return {
      id: row.id, name: row.name, role: row.role, workType: row.work_type, username: row.username,
      accessRole: row.access_role, avatarUrl: row.avatar_url ?? undefined, mustChangePassword: row.must_change_password,
      initials: row.initials, createdAt: new Date().toISOString()
    };
  }

  const data = await readWorkspace();
  if (data.members.length > 0) throw new Error("Không thể khởi tạo lại workspace đã có người dùng.");
  const member: StoredMember = {
    id: randomBytes(16).toString("hex"),
    name,
    role: input.role.trim() || "Quản trị workspace",
    workType: input.workType ?? "inhouse",
    username,
    accessRole: "admin",
    avatarUrl: input.avatarUrl,
    mustChangePassword: true,
    initials: initialsFor(name),
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString()
  };
  data.members.push(member);
  await writeWorkspace(data);
  return member;
}

export async function authenticate(username: string, password: string): Promise<{ token: string; refreshToken?: string; user: SessionUser } | null> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) return null;
  if (hasSupabaseBackend && supabaseAdmin) {
    const client = createSupabaseAuthClient();
    if (!client) throw new Error("Thiếu publishable key Supabase.");
    const { data, error } = await client.auth.signInWithPassword({ email: usernameEmail(normalizedUsername), password });
    if (error || !data.session || !data.user) return null;
    const profile = await getSupabaseProfile(data.user.id);
    if (!profile) return null;
    return { token: data.session.access_token, refreshToken: data.session.refresh_token, user: toSupabaseUser(profile) };
  }
  const data = await readWorkspace();
  const member = data.members.find((item) => item.username === normalizedUsername);
  if (!member || !await verifyPassword(password, member.passwordHash)) return null;
  const token = randomBytes(32).toString("base64url");
  data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  data.sessions.push({ tokenHash: hashToken(token), memberId: member.id, expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString() });
  await writeWorkspace(data);
  return { token, user: toLocalUser(member) };
}

export async function refreshAuthentication(refreshToken?: string | null): Promise<{ token: string; refreshToken: string; user: SessionUser } | null> {
  if (!refreshToken || !hasSupabaseBackend || !supabaseAdmin) return null;
  const client = createSupabaseAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return null;
  const profile = await getSupabaseProfile(data.user.id);
  if (!profile) return null;
  return { token: data.session.access_token, refreshToken: data.session.refresh_token, user: toSupabaseUser(profile) };
}

export async function getSessionUser(token?: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  if (hasSupabaseBackend && supabaseAdmin) {
    const client = createSupabaseAuthClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    const profile = await getSupabaseProfile(data.user.id);
    return profile ? toSupabaseUser(profile) : null;
  }
  const data = await readWorkspace();
  const session = data.sessions.find((item) => item.tokenHash === hashToken(token) && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;
  const member = data.members.find((item) => item.id === session.memberId);
  return member ? toLocalUser(member) : null;
}

export async function revokeSession(token?: string | null) {
  if (!token) return;
  if (hasSupabaseBackend) return;
  const data = await readWorkspace();
  data.sessions = data.sessions.filter((session) => session.tokenHash !== hashToken(token));
  await writeWorkspace(data);
}
