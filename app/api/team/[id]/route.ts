import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { deleteMember, updateMember } from "../../../../lib/workspace-repository";
import { ACCESS_ROLES, WORK_TYPES, type TeamMemberInput } from "../../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMemberInput(value: unknown): value is TeamMemberInput {
  if (!value || typeof value !== "object") return false;
  const member = value as Record<string, unknown>;
  return typeof member.name === "string" && member.name.trim().length > 0
    && typeof member.role === "string" && member.role.trim().length > 0
    && typeof member.username === "string" && /^[a-zA-Z0-9._-]{3,64}$/.test(member.username.trim())
    && ACCESS_ROLES.includes(member.accessRole as TeamMemberInput["accessRole"])
    && (member.password === undefined || typeof member.password === "string")
    && (member.avatarUrl === undefined || typeof member.avatarUrl === "string")
    && WORK_TYPES.includes(member.workType as TeamMemberInput["workType"]);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (user.accessRole !== "admin") return NextResponse.json({ error: "Chỉ quản trị viên có thể sửa nhân viên." }, { status: 403 });
    const input = await request.json();
    if (!isMemberInput(input) || (input.password !== undefined && input.password.length > 0 && input.password.length < 8)) return NextResponse.json({ error: "Dữ liệu không hợp lệ. Mật khẩu mới cần ít nhất 8 ký tự." }, { status: 400 });
    const { id } = await context.params;
    if (user.id === id && input.accessRole !== "admin") return NextResponse.json({ error: "Bạn không thể tự hạ quyền quản trị viên của mình." }, { status: 400 });
    const member = await updateMember(id, input);
    if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên." }, { status: 404 });
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật thành viên." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (user.accessRole !== "admin") return NextResponse.json({ error: "Chỉ quản trị viên có thể xoá nhân viên." }, { status: 403 });
    const { id } = await context.params;
    if (user.id === id) return NextResponse.json({ error: "Bạn không thể tự xoá tài khoản đang đăng nhập." }, { status: 400 });
    const removed = await deleteMember(id);
    if (!removed) return NextResponse.json({ error: "Không tìm thấy thành viên." }, { status: 404 });
    return NextResponse.json({ ok: true, reassignedOwner: "Chưa phân công" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể xoá thành viên." }, { status: 500 });
  }
}
