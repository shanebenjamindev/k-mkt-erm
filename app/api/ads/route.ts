import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { AdsConfigurationError, getMetaAdsReport } from "../../../lib/meta-ads";
import { facebookCredentials, FacebookConnectionRequired, listFacebookAdAccounts } from "../../../lib/facebook-connection";
import { can } from "../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers: responseHeaders });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa có quyền xem dữ liệu quảng cáo." }, { status: 403, headers: responseHeaders });

  const until = request.nextUrl.searchParams.get("until") ?? "";
  const since = request.nextUrl.searchParams.get("since") ?? "";
  if (!validDate(since) || !validDate(until)) return NextResponse.json({ error: "Ngày bắt đầu hoặc kết thúc không hợp lệ." }, { status: 400, headers: responseHeaders });
  const days = (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
  if (days < 0 || days > 30) return NextResponse.json({ error: "Chọn khoảng từ 1 đến 31 ngày." }, { status: 400, headers: responseHeaders });

  try {
    const credentials = await facebookCredentials(user.id);
    const accountId = (request.nextUrl.searchParams.get("account") ?? "").replace(/^act_/, "");
    const accounts = await listFacebookAdAccounts(credentials);
    if (!accounts.some(account => account.id === `act_${accountId}`)) return NextResponse.json({ error: "Tài khoản quảng cáo chưa được cấp cho kết nối Facebook của bạn." }, { status: 403, headers: responseHeaders });
    const report = await getMetaAdsReport(since, until, credentials, accountId);
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdsConfigurationError ? error.message : error instanceof Error ? error.message : "Không thể tải báo cáo Meta Ads." }, { status: error instanceof FacebookConnectionRequired ? 409 : error instanceof AdsConfigurationError ? 503 : 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
