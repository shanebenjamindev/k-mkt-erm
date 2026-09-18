import type { SVGProps } from "react";

export type IconName = "dashboard" | "tasks" | "calendar" | "briefs" | "drive" | "users" | "logout" | "folder" | "video" | "file" | "upload" | "plus" | "chevronLeft" | "more" | "edit" | "trash" | "refresh" | "external" | "close" | "warning" | "bell";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  tasks: <><path d="M9 11.5 11 13.5l4-4"/><path d="M20 12a8 8 0 1 1-4-6.9"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  briefs: <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></>,
  drive: <><path d="m8 3 4 7H4zM16 3l4 7h-8zM8 12h8l-4 7z"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M17 11a4 4 0 1 0-1-7.87M21 21v-2a4 4 0 0 0-3-3.87"/></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/>,
  video: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 13h6M9 17h4"/></>,
  upload: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chevronLeft: <path d="m15 18-6-6 6-6"/>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 4v6h6M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 20v-6h-6"/></>,
  external: <><path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  warning: <><path d="M10.3 3.5 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>
};

export function Icon({ name, size = 18, strokeWidth = 1.8, className, ...props }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
