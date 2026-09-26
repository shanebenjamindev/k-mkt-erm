import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { isProjectSettings } from "../../../lib/project-settings";
import { getProjectSettings, saveProjectSettings } from "../../../lib/workspace-repository";
import { can } from "../../../lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settingsError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  console.error("Project settings request failed:", error);
  if (/project_name|project_description|project_logo_url|notification_events|schema cache|column .* does not exist/i.test(message)) {
    return "Cơ sở dữ liệu chưa áp dụng migration cài đặt dự án. Hãy chạy migration mới nhất rồi thử lại.";
  }
  return "Không thể xử lý cài đặt dự án. Vui lòng thử lại.";
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    return NextResponse.json({ settings: await getProjectSettings() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: settingsError(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (!can(user, "project.settings.update")) return NextResponse.json({ error: "Chỉ quản trị viên được thay đổi cài đặt dự án." }, { status: 403 });
    const input: unknown = await request.json().catch(() => null);
    if (!isProjectSettings(input)) return NextResponse.json({ error: "Cài đặt không hợp lệ." }, { status: 400 });
    return NextResponse.json({ settings: await saveProjectSettings(input) });
  } catch (error) {
    return NextResponse.json({ error: settingsError(error) }, { status: 500 });
  }
}
