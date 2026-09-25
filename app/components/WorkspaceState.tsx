"use client";
import { useWorkspace } from "./WorkspaceProvider";

export function WorkspaceState({ children }: { children: React.ReactNode }) {
  const { loading, loaded, error, refresh } = useWorkspace();
  if (loading && !loaded) return <div className="workspace-message" role="status">Đang tải dữ liệu workspace…</div>;
  if (error && !loaded) return <div className="workspace-message error" role="alert">{error}<button className="secondary" onClick={() => void refresh()}>Thử lại</button></div>;
  return <>{error && <div className="workspace-sync-error" role="alert"><span>{error} Dữ liệu đang hiển thị là lần tải gần nhất.</span><button className="secondary" onClick={() => void refresh()}>Thử lại</button></div>}{children}</>;
}
