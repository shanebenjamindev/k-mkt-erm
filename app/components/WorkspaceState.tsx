"use client";

import { useWorkspace } from "./WorkspaceProvider";

export function WorkspaceState({ children }: { children: React.ReactNode }) {
  const { loading, error, refresh } = useWorkspace();
  if (loading) return <div className="workspace-message">Đang tải dữ liệu workspace…</div>;
  if (error) return <div className="workspace-message error">{error}<button className="secondary" onClick={() => void refresh()}>Thử lại</button></div>;
  return <>{children}</>;
}
