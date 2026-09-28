import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { FacebookConnectionRequired, facebookCredentials, listFacebookAdAccounts } from "../../../../lib/facebook-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa có quyền xem quảng cáo." }, { status: 403, headers });
  try { return NextResponse.json({ accounts: await listFacebookAdAccounts(await facebookCredentials(user.id)) }, { headers }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không tải được tài khoản quảng cáo." }, { status: error instanceof FacebookConnectionRequired ? 409 : 502, headers }); }
}
