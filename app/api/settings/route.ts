import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { isProjectSettings } from "../../../lib/project-settings";
import { getProjectSettings, saveProjectSettings } from "../../../lib/workspace-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    return NextResponse.json({ settings: await getProjectSettings() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải cài đặt." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword || user.accessRole !== "admin") return NextResponse.json({ error: "Chỉ quản trị viên được thay đổi cài đặt dự án." }, { status: 403 });
    const input: unknown = await request.json().catch(() => null);
    if (!isProjectSettings(input)) return NextResponse.json({ error: "Cài đặt không hợp lệ." }, { status: 400 });
    return NextResponse.json({ settings: await saveProjectSettings(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu cài đặt." }, { status: 500 });
  }
}
