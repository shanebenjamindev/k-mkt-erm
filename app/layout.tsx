import type { Metadata } from "next";
import "./globals.css";
import "./extra.css";
import "./workload.css";
import "./calendar.css";
import "./airbnb-calendar.css";
import "./login.css";
import "./drive.css";
import "./profile.css";
import "./dashboard.css";
import "./kanban.css";
import "./task-sheet.css";
import "./admin-shell.css";
import "./glass.css";
import "./readability.css";
import "./settings.css";
import "./brief-layout.css";
import { AuthProvider } from "./components/AuthProvider";
import { WorkspaceProvider } from "./components/WorkspaceProvider";
import { PwaRegistration } from "./components/PwaRegistration";
import { ProjectSettingsProvider } from "./components/ProjectSettingsProvider";

export const metadata: Metadata = {
  title: "K-MKT Workspace",
  description: "Quản lý công việc phòng Marketing",
  applicationName: "K-MKT Workspace",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "K-MKT" },
  formatDetection: { telephone: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><PwaRegistration/><AuthProvider><ProjectSettingsProvider><WorkspaceProvider>{children}</WorkspaceProvider></ProjectSettingsProvider></AuthProvider></body></html>;
}
