import { NextRequest, NextResponse } from "next/server";
import { authenticate, createFirstAccount, hasWorkspaceUsers, SESSION_COOKIE, SESSION_REFRESH_COOKIE } from "../../../../lib/auth-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ setupRequired: !(await hasWorkspaceUsers()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể kiểm tra trạng thái workspace." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { name?: unknown; role?: unknown; username?: unknown; password?: unknown } | null;
    if (!body || typeof body.name !== "string" || typeof body.role !== "string" || typeof body.username !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "Vui lòng nhập họ tên, chức vụ, username và mật khẩu." }, { status: 400 });
    }
    const member = await createFirstAccount({ name: body.name, role: body.role, username: body.username, password: body.password });
    const session = await authenticate(member.username, body.password);
    if (!session) throw new Error("Không thể tạo phiên đăng nhập.");
    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    if (session.refreshToken) response.cookies.set(SESSION_REFRESH_COOKIE, session.refreshToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể khởi tạo workspace." }, { status: 400 });
  }
}
