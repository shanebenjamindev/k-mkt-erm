import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { AdsConfigurationError, getMetaAdsReport, missingMetaConfiguration } from "../../../lib/meta-ads";
import { can } from "../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa có quyền xem dữ liệu quảng cáo." }, { status: 403 });

  const until = request.nextUrl.searchParams.get("until") ?? "";
  const since = request.nextUrl.searchParams.get("since") ?? "";
  if (!validDate(since) || !validDate(until)) return NextResponse.json({ error: "Ngày bắt đầu hoặc kết thúc không hợp lệ." }, { status: 400 });
  const days = (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
  if (days < 0 || days > 30) return NextResponse.json({ error: "Chọn khoảng từ 1 đến 31 ngày." }, { status: 400 });

  const missing = missingMetaConfiguration();
  if (missing.length) return NextResponse.json({ configured: false, missing }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const report = await getMetaAdsReport(since, until);
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdsConfigurationError ? error.message : error instanceof Error ? error.message : "Không thể tải báo cáo Meta Ads." }, { status: error instanceof AdsConfigurationError ? 503 : 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
