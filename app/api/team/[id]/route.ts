import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { deleteMember, updateMember } from "../../../../lib/workspace-repository";
import { isMemberInput } from "../../../../lib/member-validation";
import { can } from "../../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!can(user, "member.manage")) return NextResponse.json({ error: "Chỉ quản trị viên có thể sửa nhân viên." }, { status: 403 });
    const input: unknown = await request.json().catch(() => null);
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
    if (!can(user, "member.manage")) return NextResponse.json({ error: "Chỉ quản trị viên có thể xoá nhân viên." }, { status: 403 });
    const { id } = await context.params;
    if (user.id === id) return NextResponse.json({ error: "Bạn không thể tự xoá tài khoản đang đăng nhập." }, { status: 400 });
    const removed = await deleteMember(id);
    if (!removed) return NextResponse.json({ error: "Không tìm thấy thành viên." }, { status: 404 });
    return NextResponse.json({ ok: true, reassignedOwner: "Chưa phân công" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể xoá thành viên." }, { status: 500 });
  }
}
