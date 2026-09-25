import { NextRequest, NextResponse } from "next/server";
import { authenticate, hasWorkspaceUsers, SESSION_COOKIE, SESSION_REFRESH_COOKIE } from "../../../../lib/auth-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") return NextResponse.json({ error: "Vui lòng nhập username và mật khẩu." }, { status: 400 });
    const result = await authenticate(body.username, body.password);
    if (!result) {
      const setupRequired = !(await hasWorkspaceUsers());
      return NextResponse.json({ error: setupRequired ? "Workspace chưa có tài khoản. Hãy tạo tài khoản quản trị đầu tiên." : "Username hoặc mật khẩu không đúng.", setupRequired }, { status: 401 });
    }
    const response = NextResponse.json({ user: result.user });
    response.cookies.set(SESSION_COOKIE, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    if (result.refreshToken) response.cookies.set(SESSION_REFRESH_COOKIE, result.refreshToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể đăng nhập." }, { status: 500 });
  }
}
