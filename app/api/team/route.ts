import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { createMember, listMembers } from "../../../lib/workspace-repository";
import { isMemberInput } from "../../../lib/member-validation";
import { can } from "../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    return NextResponse.json({ members: await listMembers() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải thành viên." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!can(user, "member.invite")) return NextResponse.json({ error: "Chỉ quản trị viên có thể thêm nhân viên." }, { status: 403 });
    const input: unknown = await request.json().catch(() => null);
    if (!isMemberInput(input) || !input.password || input.password.length < 8) return NextResponse.json({ error: "Dữ liệu không hợp lệ. Mật khẩu cần ít nhất 8 ký tự." }, { status: 400 });
    const member = await createMember(input);
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể thêm thành viên." }, { status: 500 });
  }
}
