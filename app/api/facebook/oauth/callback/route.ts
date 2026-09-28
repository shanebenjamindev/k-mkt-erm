import { NextRequest, NextResponse } from "next/server";
import { currentToken, currentUser } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { exchangeFacebookCode, FACEBOOK_STATE_COOKIE, facebookSettings, facebookGet, saveFacebookConnection, verifyFacebookState } from "../../../../../lib/facebook-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = new URL(facebookSettings().redirect).origin; } catch { return NextResponse.json({ error: "Chưa cấu hình Facebook OAuth." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  function finish(status: string) {
    const response = NextResponse.redirect(new URL(`/ads?facebook=${status}`, origin));
    response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(FACEBOOK_STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/facebook/oauth", maxAge: 0 });
    return response;
  }
  const user = await currentUser(); const session = await currentToken();
  const cookie = request.cookies.get(FACEBOOK_STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!user || !session || !can(user, "ads.read") || !cookie || !verifyFacebookState(cookie, state, user.id, session)) return finish("invalid_state");
  if (request.nextUrl.searchParams.has("error")) return finish("cancelled");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 4096) return finish("failed");
  try {
    const access = await exchangeFacebookCode(code); const settings = facebookSettings();
    const identity = await facebookGet<{ id: string; name: string }>({ token: access.access_token, version: settings.version, secret: settings.secret }, "me", { fields: "id,name" });
    await saveFacebookConnection(user.id, access.access_token, identity.name, access.expires_in);
    return finish("connected");
  } catch { return finish("failed"); }
}
