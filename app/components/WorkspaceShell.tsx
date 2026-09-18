"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useWorkspace } from "./WorkspaceProvider";
import { Icon, type IconName } from "./Icon";
import { NotificationCenter } from "./NotificationCenter";

const links: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/", icon: "dashboard", label: "Tổng quan" },
  { href: "/tasks", icon: "tasks", label: "Tất cả công việc" },
  { href: "/calendar", icon: "calendar", label: "Lịch sản xuất" },
  { href: "/briefs", icon: "briefs", label: "Brief & tài liệu" },
  { href: "/drive", icon: "drive", label: "Video & Drive" }
];

export function WorkspaceShell({ children, title = "Workspace" }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { tasks, members } = useWorkspace();
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user?.mustChangePassword && pathname !== "/profile") router.replace("/profile?forcePassword=1");
  }, [authLoading, user, router, pathname]);

  if (authLoading || !user) return <main className="auth-loading">Đang kiểm tra phiên đăng nhập…</main>;
  const inHouse = tasks.filter((task) => task.workType === "inhouse").length;
  const outsource = tasks.filter((task) => task.workType === "outsource").length;
  const isAdmin = user.accessRole === "admin";
  const signOut = async () => { await logout(); router.replace("/login"); router.refresh(); };

  return <main className="shell"><aside className="sidebar"><Link href="/" className="brand"><span className="brand-mark">K</span><div><strong>K-MKT Workspace</strong><small>TEAM WORKSPACE</small></div></Link><nav><p>WORKSPACE</p>{links.map(({ href, icon, label }) => <Link key={href} href={href} className={pathname === href ? "nav active" : "nav"}><span className="nav-icon"><Icon name={icon} size={17}/></span>{label}{label === "Tất cả công việc" && <b>{tasks.length}</b>}</Link>)}<Link href="/profile" className={pathname === "/profile" ? "nav active" : "nav"}><span className="nav-icon"><Icon name="users" size={17}/></span>Tài khoản</Link>{isAdmin && <><p>QUẢN TRỊ</p><Link href="/team" className={pathname === "/team" ? "nav active" : "nav"}><span className="nav-icon"><Icon name="users" size={17}/></span>Nhân viên <b>{members.length}</b></Link></>}</nav><div className="profile"><Link href="/profile" className="profile-link"><span className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}</span><div><strong>{user.name}</strong><small>{isAdmin ? "QUẢN TRỊ VIÊN" : "NHÂN VIÊN"}</small></div></Link><button className="logout" title="Đăng xuất" aria-label="Đăng xuất" onClick={() => void signOut()}><Icon name="logout" size={17}/></button></div></aside><section className="content"><header><span>Marketing team / <b>{title}</b></span><div className="header-actions"><NotificationCenter/><Link href="/profile" className="header-account" aria-label="Mở thông tin tài khoản"><strong className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}</strong></Link></div></header>{children}</section></main>;
}
