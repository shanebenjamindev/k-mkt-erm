import { NextResponse } from "next/server";
import { currentRefreshToken, currentUser } from "../../../../lib/auth";
import { refreshAuthentication, SESSION_COOKIE, SESSION_REFRESH_COOKIE } from "../../../../lib/auth-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      const refreshed = await refreshAuthentication(await currentRefreshToken());
      if (!refreshed) return NextResponse.json({ user: null }, { status: 401 });
      const response = NextResponse.json({ user: refreshed.user });
      const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 };
      response.cookies.set(SESSION_COOKIE, refreshed.token, cookieOptions);
      response.cookies.set(SESSION_REFRESH_COOKIE, refreshed.refreshToken, cookieOptions);
      return response;
    }
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể kiểm tra phiên đăng nhập." }, { status: 500 });
  }
}
