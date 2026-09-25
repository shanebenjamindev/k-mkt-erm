"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useAuth } from "../components/AuthProvider";
import { Icon } from "../components/Icon";
import type { DriveItem } from "../../lib/google-drive";

import { requestJson } from "../../lib/client-request";

type DriveResponse = { connected: boolean; items: DriveItem[]; folderId?: string; rootFolderId?: string; error?: string };
type TrailItem = { id: string; name: string };

export default function DrivePage() {
  const { user } = useAuth();
  const isAdmin = user?.accessRole === "admin";
  const [items, setItems] = useState<DriveItem[]>([]);
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<DriveItem | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [renameItem, setRenameItem] = useState<DriveItem | null>(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const loadController = useRef<AbortController | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const currentFolderId = trail.at(-1)?.id;

  const load = useCallback(async (folderId?: string) => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    try {
      const body = await requestJson<DriveResponse>(`/api/drive${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      setConnected(body.connected);
      setItems(body.items);
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted) { setItems([]); setError(cause instanceof Error ? cause.message : "Không thể tải Google Drive."); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => { if (user && !user.mustChangePassword) void load(); return () => loadController.current?.abort(); }, [load, user?.id, user?.mustChangePassword]);

  const request = (url: string, init?: RequestInit) => requestJson(url, init, 120_000);

  const createFolder = async (name: string) => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    try { await request("/api/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId: currentFolderId }) }); setFolderDialog(false); await load(currentFolderId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo thư mục."); }
    finally { workingRef.current = false; setWorking(false); }
  };

  const rename = async (name: string) => {
    if (!renameItem) return;
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    try { await request("/api/drive", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: renameItem.id, name }) }); setRenameItem(null); await load(currentFolderId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đổi tên."); }
    finally { workingRef.current = false; setWorking(false); }
  };

  const remove = async (item: DriveItem) => {
    if (!window.confirm(`Đưa “${item.name}” vào thùng rác Google Drive?`)) return;
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    try { await request(`/api/drive?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }); if (selectedVideo?.id === item.id) setSelectedVideo(null); await load(currentFolderId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xoá tệp."); }
    finally { workingRef.current = false; setWorking(false); }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    try { const form = new FormData(); form.append("file", file); if (currentFolderId) form.append("parentId", currentFolderId); await request("/api/drive/upload", { method: "POST", body: form }); await load(currentFolderId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể upload tệp."); }
    finally { workingRef.current = false; setWorking(false); if (uploadInput.current) uploadInput.current.value = ""; }
  };

  const openFolder = (item: DriveItem) => { if (workingRef.current || loading) return; setTrail((current) => [...current, { id: item.id, name: item.name }]); setSelectedVideo(null); void load(item.id); };
  const returnTo = (index: number) => { if (workingRef.current) return; const next = trail.slice(0, index + 1); setTrail(next); setSelectedVideo(null); void load(next.at(-1)?.id); };
  const videos = items.filter((item) => item.kind === "video");

  return <WorkspaceShell title="Video & Drive"><div className="drive-page"><div className="drive-heading"><div><small>MEDIA LIBRARY / GOOGLE DRIVE</small><h1>Video & Drive</h1><p>Video, tài liệu và thư mục được đồng bộ trực tiếp với Google Drive.</p></div>{connected && isAdmin && <div className="drive-actions"><input ref={uploadInput} className="visually-hidden" type="file" onChange={(event) => void upload(event.target.files?.[0])}/><button className="secondary icon-button" onClick={() => void load(currentFolderId)} disabled={loading || working} title="Đồng bộ lại"><Icon name="refresh"/></button><button className="secondary" disabled={working} onClick={() => setFolderDialog(true)}><Icon name="folder" size={16}/> Thư mục</button><button className="primary" onClick={() => uploadInput.current?.click()} disabled={working}><Icon name="upload" size={16}/> Upload</button></div>}</div>{error && <div className="drive-alert"><Icon name="warning" size={18}/><span>{error}</span><button className="text-button" onClick={() => void load(currentFolderId)}>Thử lại</button></div>}{connected === false ? <ConnectDriveCard/> : <><div className="drive-toolbar"><div className="breadcrumbs"><button disabled={working} onClick={() => { setTrail([]); setSelectedVideo(null); void load(); }}>Drive</button>{trail.map((item, index) => <span key={item.id}><b>/</b><button onClick={() => returnTo(index)}>{item.name}</button></span>)}</div><span>{loading ? "Đang đồng bộ…" : `${items.length} mục`}</span></div>{selectedVideo && <VideoPlayer item={selectedVideo} onClose={() => setSelectedVideo(null)}/>}<div className="drive-grid">{loading ? <div className="drive-empty">Đang tải dữ liệu Drive…</div> : items.length === 0 ? <div className="drive-empty"><Icon name="folder" size={30}/><b>Thư mục này đang trống</b><span>{isAdmin ? "Tạo thư mục hoặc upload file để bắt đầu." : "Chưa có video hoặc tài liệu nào."}</span></div> : items.map((item) => <DriveCard key={item.id} item={item} isAdmin={isAdmin && !working} onOpenFolder={() => openFolder(item)} onPlay={() => setSelectedVideo(item)} onRename={() => setRenameItem(item)} onDelete={() => void remove(item)} />)}</div>{videos.length > 0 && !selectedVideo && <p className="drive-video-hint">Chọn một video để xem trực tiếp trong workspace.</p>}</>}</div>{folderDialog && <NameDialog title="Tạo thư mục mới" label="Tên thư mục" submitLabel="Tạo thư mục" submitting={working} onClose={() => setFolderDialog(false)} onSubmit={createFolder}/>} {renameItem && <NameDialog title="Đổi tên" label={renameItem.kind === "folder" ? "Tên thư mục" : "Tên tệp"} initialValue={renameItem.name} submitLabel="Lưu thay đổi" submitting={working} onClose={() => setRenameItem(null)} onSubmit={rename}/>}</WorkspaceShell>;
}

function ConnectDriveCard() { return <div className="drive-connect"><div className="drive-connect-icon"><Icon name="drive" size={27}/></div><div><small>GOOGLE DRIVE CHƯA KẾT NỐI</small><h2>Kết nối thư viện media của bạn</h2><p>Thêm Google OAuth credentials vào biến môi trường để xem, upload, đổi tên, xoá file và quản lý thư mục trực tiếp từ workspace.</p><code>GOOGLE_DRIVE_CLIENT_ID · GOOGLE_DRIVE_CLIENT_SECRET · GOOGLE_DRIVE_REFRESH_TOKEN</code></div></div>; }

function DriveCard({ item, isAdmin, onOpenFolder, onPlay, onRename, onDelete }: { item: DriveItem; isAdmin: boolean; onOpenFolder: () => void; onPlay: () => void; onRename: () => void; onDelete: () => void }) {
  const open = item.kind === "folder" ? onOpenFolder : item.kind === "video" ? onPlay : () => { if (item.webViewLink) window.open(item.webViewLink, "_blank", "noopener,noreferrer"); };
  const icon = item.kind === "folder" ? "folder" : item.kind === "video" ? "video" : "file";
  return <article className={`drive-card ${item.kind}`}><button className="drive-main" onClick={open}><span className="drive-file-icon"><Icon name={icon} size={22}/></span>{item.thumbnailLink && item.kind === "video" ? <img src={item.thumbnailLink} alt=""/> : null}<div><strong>{item.name}</strong><small>{item.kind === "folder" ? "Thư mục" : item.kind === "video" ? "Video" : "Tệp"} · {formatDate(item.modifiedTime)}</small></div></button>{isAdmin && <div className="drive-card-actions"><button className="icon-button" title="Đổi tên" onClick={onRename}><Icon name="edit" size={16}/></button><button className="icon-button danger-icon" title="Xoá" onClick={onDelete}><Icon name="trash" size={16}/></button></div>}</article>;
}

function VideoPlayer({ item, onClose }: { item: DriveItem; onClose: () => void }) { return <section className="video-player"><div className="video-player-top"><div><small>VIDEO PREVIEW</small><h2>{item.name}</h2></div><div><a className="secondary" href={item.webViewLink} target="_blank" rel="noreferrer"><Icon name="external" size={15}/> Mở Drive</a><button className="icon-button" title="Đóng" onClick={onClose}><Icon name="close"/></button></div></div><div className="video-frame"><iframe src={`https://drive.google.com/file/d/${item.id}/preview`} title={item.name} allow="autoplay"/></div></section>; }

function NameDialog({ title, label, initialValue = "", submitLabel, submitting, onClose, onSubmit }: { title: string; label: string; initialValue?: string; submitLabel: string; submitting: boolean; onClose: () => void; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(initialValue);
  return <div className="overlay" role="presentation" onMouseDown={onClose}><form className="modal drive-dialog" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit(value); }} onMouseDown={(event) => event.stopPropagation()}><button className="close" type="button" aria-label="Đóng" onClick={onClose}>×</button><small>GOOGLE DRIVE</small><h2>{title}</h2><label className="field">{label}<input required autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Huỷ</button><button className="primary" disabled={submitting}>{submitting ? "Đang xử lý…" : submitLabel}</button></div></form></div>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); }
