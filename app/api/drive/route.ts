import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { createDriveFolder, driveStatus, listDriveItems, trashDriveItem, updateDriveItem } from "../../../lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminOnly(user: Awaited<ReturnType<typeof currentUser>>) {
  return user?.accessRole === "admin";
}

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    const status = driveStatus();
    if (!status.connected) return NextResponse.json({ ...status, items: [] });
    const result = await listDriveItems(request.nextUrl.searchParams.get("folderId") || undefined);
    return NextResponse.json({ connected: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải Google Drive." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!adminOnly(user)) return NextResponse.json({ error: "Chỉ quản trị viên có thể tạo thư mục." }, { status: 403 });
    const body = await request.json() as { name?: unknown; parentId?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Tên thư mục là bắt buộc." }, { status: 400 });
    const item = await createDriveFolder(body.name, typeof body.parentId === "string" ? body.parentId : undefined);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo thư mục." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!adminOnly(user)) return NextResponse.json({ error: "Chỉ quản trị viên có thể cập nhật tệp." }, { status: 403 });
    const body = await request.json() as { id?: unknown; name?: unknown; parentId?: unknown };
    if (typeof body.id !== "string" || (!body.name && !body.parentId)) return NextResponse.json({ error: "Dữ liệu cập nhật không hợp lệ." }, { status: 400 });
    const item = await updateDriveItem(body.id, { name: typeof body.name === "string" ? body.name : undefined, parentId: typeof body.parentId === "string" ? body.parentId : undefined });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể cập nhật tệp." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Bạn cần đổi mật khẩu trước khi thao tác workspace." }, { status: 403 });
    if (!adminOnly(user)) return NextResponse.json({ error: "Chỉ quản trị viên có thể xoá tệp." }, { status: 403 });
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Thiếu ID tệp." }, { status: 400 });
    await trashDriveItem(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể xoá tệp." }, { status: 500 });
  }
}
