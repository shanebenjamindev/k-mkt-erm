import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { facebookConnectionStatus, facebookSettings, removeFacebookConnection } from "../../../../lib/facebook-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa có quyền xem kết nối." }, { status: 403, headers });
  try { return NextResponse.json(await facebookConnectionStatus(user.id), { headers }); }
  catch { return NextResponse.json({ error: "Không thể đọc kết nối Facebook." }, { status: 503, headers }); }
}
export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers });
  if (!can(user, "ads.read")) return NextResponse.json({ error: "Bạn chưa có quyền thay đổi kết nối." }, { status: 403, headers });
  try {
    if (request.headers.get("origin") !== new URL(facebookSettings().redirect).origin) return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403, headers });
    await removeFacebookConnection(user.id); return NextResponse.json({ ok: true }, { headers });
  } catch { return NextResponse.json({ error: "Không thể ngắt kết nối Facebook." }, { status: 503, headers }); }
}
