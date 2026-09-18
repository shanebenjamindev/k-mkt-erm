"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceNotification } from "../../lib/types";
import { useAuth } from "./AuthProvider";
import { Icon } from "./Icon";

type PushConfig = { configured: boolean; publicKey: string | null; error?: string };

function base64ToBytes(value: string) {
  const normalized = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function NotificationCenter() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkspaceNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const body = await response.json() as { notifications?: WorkspaceNotification[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không thể tải thông báo.");
      setItems(body.notifications ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải thông báo."); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const markRead = async (id: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  };

  const openNotification = (item: WorkspaceNotification) => {
    void markRead(item.id);
    setOpen(false);
    if (item.taskId) router.push(`/tasks?task=${encodeURIComponent(item.taskId)}`);
  };

  const enablePush = async () => {
    setMessage(null);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !window.isSecureContext) throw new Error("Thiết bị cần mở app qua HTTPS để bật thông báo.");
      const configResponse = await fetch("/api/notifications/push", { cache: "no-store" });
      const config = await configResponse.json() as PushConfig;
      if (!configResponse.ok || !config.configured || !config.publicKey) throw new Error("Push notification chưa được cấu hình trên server.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Bạn chưa cho phép nhận thông báo.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(config.publicKey) });
      const response = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không thể lưu thiết bị nhận thông báo.");
      setMessage("Đã bật push notification cho thiết bị này.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể bật thông báo."); }
  };

  const unread = items.filter((item) => !item.readAt).length;
  return <div className="notification-center"><button className="notification-trigger" type="button" onClick={() => { setOpen((current) => !current); if (!open) void load(); }} aria-label="Thông báo"><Icon name="bell" size={18}/>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}</button>{open && <div className="notification-panel"><div className="notification-panel-head"><div><strong>Thông báo</strong><small>{unread ? `${unread} chưa đọc` : "Đã xem tất cả"}</small></div><button type="button" className="text-button" onClick={() => void enablePush()}>Bật noti iPhone</button></div>{message && <p className="notification-message">{message}</p>}<div className="notification-list">{loading && !items.length ? <p>Đang tải…</p> : items.length ? items.map((item) => <button type="button" className={item.readAt ? "notification-item" : "notification-item unread"} key={item.id} onClick={() => openNotification(item)}><span><b>{item.title}</b><small>{item.body}</small></span><time>{formatTime(item.createdAt)}</time></button>) : <p>Chưa có thông báo mới.</p>}</div></div>}</div>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
