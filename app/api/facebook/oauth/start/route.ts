import { NextRequest, NextResponse } from "next/server";
import { currentToken, currentUser } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { facebookSettings, FACEBOOK_STATE_COOKIE, makeFacebookState } from "../../../../../lib/facebook-connection";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  const user = await currentUser(); const token = await currentToken();
  if (!user || !token) return NextResponse.json({ error: "Vui lòng đăng nhập K-MKT." }, { status: 401, headers });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa được cấp quyền kết nối Facebook." }, { status: 403, headers });
  try {
    const settings = facebookSettings();
    if (request.headers.get("origin") !== new URL(settings.redirect).origin) return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403, headers });
    const { state, cookie } = makeFacebookState(user.id, token);
    const url = new URL(`https://www.facebook.com/${settings.version}/dialog/oauth`);
    url.searchParams.set("client_id", settings.appId); url.searchParams.set("redirect_uri", settings.redirect); url.searchParams.set("response_type", "code"); url.searchParams.set("state", state);
    url.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_read_user_content,read_insights,ads_read"); url.searchParams.set("auth_type", "rerequest");
    const response = NextResponse.json({ url: url.toString() }, { headers });
    response.cookies.set(FACEBOOK_STATE_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/facebook/oauth", maxAge: 600 });
    return response;
  } catch { return NextResponse.json({ error: "Chưa cấu hình đăng nhập Facebook. Liên hệ quản trị viên." }, { status: 503, headers }); }
}
