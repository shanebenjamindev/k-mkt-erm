import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/permissions";
import { WorkspaceShell } from "../components/WorkspaceShell";
import AdsClient from "./AdsClient";

export const dynamic = "force-dynamic";
export default async function AdsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Fads");
  if (user.mustChangePassword) redirect("/profile?forcePassword=1");
  if (!can(user, "ads.read")) return <WorkspaceShell title="Facebook & Quảng cáo"><div className="access-denied"><h1>Không có quyền xem báo cáo</h1><p>Tài khoản của bạn chưa được cấp quyền truy cập báo cáo Facebook.</p></div></WorkspaceShell>;
  return <AdsClient/>;
}
