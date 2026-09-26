"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useWorkspace } from "./WorkspaceProvider";
import { Icon, type IconName } from "./Icon";
import { NotificationCenter } from "./NotificationCenter";
import { useProjectSettings } from "./ProjectSettingsProvider";
import { can } from "../../lib/permissions";
import { DriveImage } from "./DriveImage";

const links: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/", icon: "dashboard", label: "Tổng quan" },
  { href: "/tasks", icon: "tasks", label: "Tất cả công việc" },
  { href: "/calendar", icon: "calendar", label: "Lịch sản xuất" },
  { href: "/briefs", icon: "briefsNav", label: "Brief & tài liệu" },
  { href: "/drive", icon: "drive", label: "Video & Drive" }
];

export function WorkspaceShell({ children, title = "Workspace" }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const signingOutRef = useRef(false);
  const { user, loading: authLoading, error: authError, refresh: refreshAuth, logout } = useAuth();
  const { tasks, members } = useWorkspace();
  const { settings, logoRevision } = useProjectSettings();
  const pendingTaskCount = tasks.reduce((count, task) => count + Number(task.status !== "completed"), 0);

  useEffect(() => {
    if (!authLoading && !user && !authError) router.replace("/login");
    if (!authLoading && user?.mustChangePassword && pathname !== "/profile") router.replace("/profile?forcePassword=1");
  }, [authLoading, authError, user, router, pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const media = window.matchMedia("(max-width: 850px)");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = sidebarRef.current;
    sidebar?.querySelector<HTMLElement>("a, button:not(:disabled)")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
      if (event.key !== "Tab" || !sidebar) return;
      const controls = Array.from(sidebar.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (!media.matches) setMobileMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    media.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      media.removeEventListener("change", onResize);
      menuButtonRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  if (!authLoading && !user && authError) return <main className="auth-loading"><div className="auth-error" role="alert"><p>{authError}</p><button className="secondary" onClick={() => void refreshAuth().catch(() => undefined)}>Thử lại</button></div></main>;
  if (authLoading || !user) return <main className="auth-loading" role="status">Đang kiểm tra phiên đăng nhập…</main>;
  const isAdmin = can(user, "member.manage");
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const signOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Không thể đăng xuất. Vui lòng thử lại.");
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };

  return <main className={`shell${navigationCollapsed ? " navigation-collapsed" : ""}`}>
    {mobileMenuOpen && <button className="mobile-menu-backdrop" aria-label="Đóng menu" tabIndex={-1} onClick={closeMobileMenu}/>}
    <aside ref={sidebarRef} id="workspace-navigation" className={`sidebar${mobileMenuOpen ? " mobile-open" : ""}`} aria-label="Điều hướng chính" role={mobileMenuOpen ? "dialog" : undefined} aria-modal={mobileMenuOpen || undefined}>
      <div className="sidebar-brand-row">
        <Link href="/" className="brand" onClick={closeMobileMenu} title={settings.projectName}><span className="brand-mark">{settings.projectLogoUrl ? <DriveImage src={settings.projectLogoUrl} alt="" fallback="K" cacheKey={logoRevision}/> : "K"}</span><div><strong>{settings.projectName}</strong><small>{settings.projectDescription || "TEAM WORKSPACE"}</small></div></Link>
        <button className="workspace-sidebar-collapse" type="button" aria-label={navigationCollapsed ? "Mở rộng sidebar Workspace" : "Thu gọn sidebar Workspace"} aria-expanded={!navigationCollapsed} onClick={() => setNavigationCollapsed((value) => !value)}>{navigationCollapsed ? "›" : "‹"}</button>
      </div>
      <button className="mobile-menu-close" type="button" aria-label="Đóng menu" onClick={closeMobileMenu}><Icon name="close" size={17}/></button>
      <nav>
        <p>WORKSPACE</p>
        {links.map(({ href, icon, label }) => <Link key={href} href={href} title={label} onClick={closeMobileMenu} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "nav active" : "nav"}>
          <span className="nav-icon"><Icon name={icon} size={17}/></span><span className="nav-label">{label}</span>
          {href === "/tasks" && pendingTaskCount > 0 && <b title={`${pendingTaskCount} công việc chưa hoàn thành`} aria-label={`${pendingTaskCount} chưa hoàn thành`}>{pendingTaskCount}</b>}
        </Link>)}
        <Link href="/profile" title="Tài khoản" onClick={closeMobileMenu} aria-current={pathname === "/profile" ? "page" : undefined} className={pathname === "/profile" ? "nav active" : "nav"}><span className="nav-icon"><Icon name="users" size={17}/></span><span className="nav-label">Tài khoản</span></Link>
        {isAdmin && <><p>QUẢN TRỊ</p><Link href="/team" title="Nhân viên" onClick={closeMobileMenu} aria-current={pathname === "/team" ? "page" : undefined} className={pathname === "/team" ? "nav active" : "nav"}><span className="nav-icon"><Icon name="users" size={17}/></span><span className="nav-label">Nhân viên</span><b>{members.length}</b></Link><Link href="/settings" title="Cài đặt dự án" onClick={closeMobileMenu} aria-current={pathname === "/settings" ? "page" : undefined} className={pathname === "/settings" ? "nav active" : "nav"}><span className="nav-icon"><Icon name="settings" size={17}/></span><span className="nav-label">Cài đặt dự án</span></Link></>}
      </nav>
      <div className="profile"><Link href="/profile" className="profile-link" onClick={closeMobileMenu}><span className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}</span><div><strong>{user.name}</strong><small>{isAdmin ? "QUẢN TRỊ VIÊN" : "NHÂN VIÊN"}</small></div></Link><button className="logout" type="button" title="Đăng xuất" aria-label="Đăng xuất" disabled={signingOut} onClick={() => void signOut()}><Icon name="logout" size={17}/></button></div>
    </aside>
    <section className="content">
      <header className="workspace-header">
        <button ref={menuButtonRef} className="admin-menu-toggle" type="button" aria-label={mobileMenuOpen ? "Đóng menu" : "Mở menu"} aria-expanded={mobileMenuOpen} aria-controls="workspace-navigation" onClick={() => setMobileMenuOpen((open) => !open)}><span/><span/><span/></button>
        <span className="workspace-crumb">{settings.projectName} <span aria-hidden="true">/</span> <b>{title}</b></span>
        <div className="header-actions">
          <Link href="/tasks" className="header-task-link" title={`${pendingTaskCount} công việc chưa hoàn thành`} aria-label={`Công việc: ${pendingTaskCount} chưa hoàn thành`}>
            <Icon name="tasks" size={19}/>
            {pendingTaskCount > 0 && <b className="task-count-badge" aria-hidden="true">{pendingTaskCount > 99 ? "99+" : pendingTaskCount}</b>}
          </Link>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{pendingTaskCount} công việc chưa hoàn thành</span>
          <NotificationCenter/>
          <Link href="/profile" className="header-account" aria-label="Mở thông tin tài khoản"><strong className="user-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}</strong></Link>
        </div>
      </header>
      {signOutError && <p className="shell-error" role="alert">{signOutError}</p>}
      {children}
    </section>
  </main>;
}
