import { NextResponse } from "next/server";
import { getProjectSettings } from "../../../lib/workspace-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public project identity only, used on the sign-in screen before a session exists. */
export async function GET() {
  try {
    const { projectName, projectLogoUrl } = await getProjectSettings();
    return NextResponse.json({ brand: { projectName, projectLogoUrl } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Không thể tải nhận diện workspace." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
