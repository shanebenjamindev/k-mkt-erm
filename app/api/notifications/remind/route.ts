import { NextRequest, NextResponse } from "next/server";
import { createDeadlineReminders, createScheduledReminders } from "../../../../lib/workspace-repository";
import { sendPushNotifications } from "../../../../lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Không có quyền chạy reminder." }, { status: 401 });
  const notifications = [...await createDeadlineReminders(), ...await createScheduledReminders()];
  const delivery = await sendPushNotifications(notifications);
  return NextResponse.json({ created: notifications.length, ...delivery });
}

export async function GET(request: NextRequest) {
  try { return await run(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo reminder." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try { return await run(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo reminder." }, { status: 500 }); }
}
