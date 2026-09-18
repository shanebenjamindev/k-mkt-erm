import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { removePushSubscription, savePushSubscription } from "../../../../lib/workspace-repository";
import { pushConfiguration } from "../../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  return NextResponse.json(pushConfiguration());
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const body = await request.json() as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    if (typeof body.endpoint !== "string" || typeof body.keys?.p256dh !== "string" || typeof body.keys.auth !== "string") return NextResponse.json({ error: "Push subscription không hợp lệ." }, { status: 400 });
    await savePushSubscription(user.id, { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể bật push notification." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string") return NextResponse.json({ error: "Push subscription không hợp lệ." }, { status: 400 });
    return NextResponse.json({ ok: await removePushSubscription(user.id, body.endpoint) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tắt push notification." }, { status: 500 });
  }
}
