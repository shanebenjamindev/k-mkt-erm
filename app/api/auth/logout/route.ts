import { NextResponse } from "next/server";
import { currentToken } from "../../../../lib/auth";
import { revokeSession, SESSION_COOKIE, SESSION_REFRESH_COOKIE } from "../../../../lib/auth-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await revokeSession(await currentToken());
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    response.cookies.set(SESSION_REFRESH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể đăng xuất." }, { status: 500 });
  }
}
