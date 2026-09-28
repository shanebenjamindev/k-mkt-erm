import { NextRequest, NextResponse } from "next/server";
import { facebookCredentials, FacebookConnectionRequired } from "../../../../lib/facebook-connection";
import { currentUser } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { getFacebookPageReport, listFacebookPages } from "../../../../lib/meta-pages";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa có quyền xem báo cáo." }, { status: 403, headers });
  const id = request.nextUrl.searchParams.get("page");
  try {
    const credentials = await facebookCredentials(user.id);
    if (!id) return NextResponse.json({ pages: await listFacebookPages(credentials) }, { headers });
    const since = request.nextUrl.searchParams.get("since") ?? "";
    const until = request.nextUrl.searchParams.get("until") ?? "";
    const days = (Date.parse(until) - Date.parse(since)) / 86400000;
    if (!/^\d+$/.test(id) || !validDate(since) || !validDate(until) || days < 0 || days > 30) return NextResponse.json({ error: "Chọn Fanpage và khoảng từ 1 đến 31 ngày hợp lệ." }, { status: 400, headers });
    return NextResponse.json(await getFacebookPageReport(id, since, until, credentials), { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể đọc Fanpage." }, { status: error instanceof FacebookConnectionRequired ? 409 : 502, headers }); }
}
