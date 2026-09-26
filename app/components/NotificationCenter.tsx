"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ReminderRepeat, WorkspaceNotification } from "../../lib/types";
import { requestJson, RequestError } from "../../lib/client-request";
import { notificationDocumentTitle, notificationEventKey, readAllNotificationsInFeed, readNotificationInFeed, reminderAvailableAt, type NotificationFeed } from "../../lib/notification-state";
import { useAuth } from "./AuthProvider";
import { Icon } from "./Icon";
import { playNotificationTone } from "../../lib/notification-sound";
import { useProjectSettings } from "./ProjectSettingsProvider";

type PushConfig = { configured: boolean; publicKey: string | null; error?: string };
type Feedback = { text: string; kind: "success" | "error" };
type Mutation = { type: "read"; id: string } | { type: "read-all" } | { type: "remind"; id: string } | { type: "schedule"; id: string; scheduledAt: string; repeat: ReminderRepeat };
const SOUND_SETTING_KEY = "k-mkt-notification-sound";
const CHANGE_KEY = "k-mkt-notifications-changed";
const EMPTY_FEED: NotificationFeed = { notifications: [], unreadCount: 0 };

function base64ToBytes(value: string) {
  const normalized = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function NotificationCenter() {
  const { settings: projectSettings } = useProjectSettings();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [feed, setFeedState] = useState<NotificationFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [now, setNow] = useState(Date.now);
  const [retryAt, setRetryAt] = useState<Record<string, number>>({});
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleRepeat, setScheduleRepeat] = useState<ReminderRepeat>("none");
  const containerRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef(feed);
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;
  const requestVersion = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const mutationRef = useRef<string | null>(null);
  const pushRef = useRef(false);
  const knownEvents = useRef<Set<string> | null>(null);
  const soundEnabledRef = useRef(true);
  const soundUnlockedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const setFeed = useCallback((next: NotificationFeed) => {
    feedRef.current = next;
    setFeedState(next);
  }, []);

  const unlockSound = useCallback(async () => {
    if (!soundEnabledRef.current || !window.AudioContext) return;
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      soundUnlockedRef.current = context.state === "running";
    } catch { soundUnlockedRef.current = false; }
  }, []);

  const playSound = useCallback(() => {
    const context = audioContextRef.current;
    if (!soundEnabledRef.current || !soundUnlockedRef.current || !context || context.state !== "running" || document.visibilityState !== "visible") return;
    playNotificationTone(context, projectSettings.notificationTone);
  }, [projectSettings.notificationTone]);

  const acceptFeed = useCallback((next: NotificationFeed) => {
    const known = knownEvents.current;
    const hasNewUnread = Boolean(known && next.notifications.some((item) => !item.readAt && !known.has(notificationEventKey(item))));
    knownEvents.current = new Set(next.notifications.map(notificationEventKey));
    setFeed(next);
    if (hasNewUnread) playSound();
  }, [playSound, setFeed]);

  const load = useCallback(async () => {
    if (!userId || mutationRef.current || loadController.current) return;
    const controller = new AbortController();
    loadController.current = controller;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      let next: NotificationFeed;
      let checkWarning: string | null = null;
      try {
        next = await requestJson<NotificationFeed>("/api/notifications/check", { method: "POST", cache: "no-store", signal: controller.signal });
      } catch (checkError) {
        if (controller.signal.aborted) throw checkError;
        // Keep the feed available even if scheduled delivery is temporarily unavailable.
        checkWarning = checkError instanceof Error ? `Lịch nhắc: ${checkError.message}` : "Không thể kiểm tra lịch nhắc.";
        next = await requestJson<NotificationFeed>("/api/notifications", { cache: "no-store", signal: controller.signal });
      }
      if (controller.signal.aborted || version !== requestVersion.current || activeUserRef.current !== userId) return;
      acceptFeed(next);
      setLoadError(checkWarning);
    } catch (error) {
      if (!controller.signal.aborted && version === requestVersion.current && activeUserRef.current === userId) {
        setLoadError(error instanceof Error ? error.message : "Không thể tải thông báo.");
      }
    } finally {
      if (loadController.current === controller) loadController.current = null;
      if (version === requestVersion.current && activeUserRef.current === userId) setLoading(false);
    }
  }, [acceptFeed, userId]);

  useEffect(() => {
    setFeed(EMPTY_FEED);
    knownEvents.current = null;
    mutationRef.current = null;
    setBusy(null);
    setRetryAt({});
    setFeedback(null);
    setLoadError(null);
    setOpen(false);
    setScheduleFor(null);
    setLoading(false);
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const storage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) refresh(); };
    const warning = (event: Event) => { const message = (event as CustomEvent<string>).detail; if (message) setFeedback({ text: message, kind: "error" }); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("workspace:notifications-changed", refresh);
    window.addEventListener("workspace:notification-warning", warning);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++requestVersion.current;
      loadController.current?.abort();
      loadController.current = null;
      mutationController.current?.abort();
      mutationController.current = null;
      mutationRef.current = null;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("workspace:notifications-changed", refresh);
      window.removeEventListener("workspace:notification-warning", warning);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, setFeed]);

  useEffect(() => {
    const updateTitle = () => {
      const title = notificationDocumentTitle(document.title, feed.unreadCount);
      if (document.title !== title) document.title = title;
    };
    updateTitle();
    // App-router navigation may replace <title> while this shared shell stays mounted.
    const observer = new MutationObserver(updateTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = notificationDocumentTitle(document.title, 0);
    };
  }, [feed.unreadCount]);

  useEffect(() => {
    let enabled = true;
    try { enabled = window.localStorage.getItem(SOUND_SETTING_KEY) !== "off"; } catch { /* Storage may be disabled. */ }
    setSoundEnabled(enabled);
    soundEnabledRef.current = enabled;
    const unlock = () => { void unlockSound(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      soundUnlockedRef.current = false;
    };
  }, [unlockSound]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const mutate = async (action: Mutation) => {
    if (!userId || mutationRef.current) return;
    const before = feedRef.current;
    if (action.type === "read" && !before.notifications.some((item) => item.id === action.id && !item.readAt)) return;
    const key = action.type === "read-all" ? "read-all" : `${action.type}:${action.id}`;
    mutationRef.current = key;
    setBusy(key);
    setFeedback(null);
    loadController.current?.abort();
    loadController.current = null;
    setLoading(false);
    const version = ++requestVersion.current;
    const controller = new AbortController();
    mutationController.current = controller;
    if (action.type === "read") setFeed(readNotificationInFeed(before, action.id));
    if (action.type === "read-all") setFeed(readAllNotificationsInFeed(before));
    let failed = false;
    try {
      const next = await requestJson<NotificationFeed & { warning?: string }>(
        action.type === "remind" ? `/api/notifications/${encodeURIComponent(action.id)}/remind` : action.type === "schedule" ? `/api/notifications/${encodeURIComponent(action.id)}/schedule` : "/api/notifications",
        action.type === "remind" ? { method: "POST", signal: controller.signal } : action.type === "schedule" ? { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ scheduledAt: action.scheduledAt, repeat: action.repeat }) } : {
          method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify(action.type === "read-all" ? { all: true } : { id: action.id })
        }
      );
      if (version !== requestVersion.current || activeUserRef.current !== userId || controller.signal.aborted) return;
      acceptFeed(next);
      setLoadError(null);
      setNow(Date.now());
      if (action.type === "remind") setFeedback({ text: next.warning ?? "Đã gửi lại nhắc nhở.", kind: "success" });
      if (action.type === "schedule") { setScheduleFor(null); setFeedback({ text: "Đã đặt lịch nhắc nhở.", kind: "success" }); }
      if (action.type === "read-all") setFeedback({ text: "Đã đánh dấu tất cả thông báo là đã đọc.", kind: "success" });
      try { window.localStorage.setItem(CHANGE_KEY, `${Date.now()}:${Math.random()}`); } catch { /* Polling still refreshes other tabs. */ }
    } catch (error) {
      if (version !== requestVersion.current || activeUserRef.current !== userId || controller.signal.aborted) return;
      failed = true;
      setFeed(before);
      setFeedback({ text: error instanceof Error ? error.message : "Không thể cập nhật thông báo.", kind: "error" });
      if (action.type === "remind" && error instanceof RequestError && error.status === 429) {
        const seconds = Number((error.body as { retryAfter?: number } | null)?.retryAfter);
        if (Number.isFinite(seconds) && seconds > 0) setRetryAt((current) => ({ ...current, [action.id]: Date.now() + seconds * 1_000 }));
      }
    } finally {
      if (version === requestVersion.current && activeUserRef.current === userId) {
        mutationRef.current = null;
        mutationController.current = null;
        setBusy(null);
        // A lost response may still have committed; reconcile instead of keeping the rollback forever.
        if (failed) void load();
      }
    }
  };

  const openNotification = (item: WorkspaceNotification) => {
    if (mutationRef.current) return;
    void mutate({ type: "read", id: item.id });
    setOpen(false);
    if (item.taskId) router.push(`/tasks?task=${encodeURIComponent(item.taskId)}`);
  };

  const enablePush = async () => {
    if (pushRef.current) return;
    pushRef.current = true;
    setPushBusy(true);
    setFeedback(null);
    try {
      if (!window.isSecureContext) throw new Error("Thông báo đẩy cần kết nối HTTPS.");
      const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (isIOS && !standalone) throw new Error("Trên iPhone, mở website bằng Safari, chọn Chia sẻ → Thêm vào Màn hình chính, rồi mở lại từ icon K-MKT để bật thông báo.");
      if (!("serviceWorker" in navigator)) throw new Error("Trình duyệt hiện tại không hỗ trợ Service Worker.");
      if (!("Notification" in window) || !("PushManager" in window)) throw new Error("Thiết bị chưa hỗ trợ Web Push. iPhone/iPad cần iOS hoặc iPadOS 16.4 trở lên.");
      const config = await requestJson<PushConfig>("/api/notifications/push", { cache: "no-store" });
      if (!config.configured || !config.publicKey) throw new Error(config.error ?? "Server chưa có cặp khóa VAPID hợp lệ.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Bạn chưa cho phép nhận thông báo.");
      let readyTimer: number | undefined;
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => { readyTimer = window.setTimeout(() => reject(new Error("Thiết bị chưa sẵn sàng nhận thông báo. Vui lòng tải lại trang rồi thử lại.")), 15_000); })
      ]).finally(() => window.clearTimeout(readyTimer));
      const applicationServerKey = base64ToBytes(config.publicKey);
      let subscription = await registration.pushManager.getSubscription();
      const existingKey = subscription?.options.applicationServerKey;
      if (subscription && (!existingKey || !sameBytes(new Uint8Array(existingKey), applicationServerKey))) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      if (activeUserRef.current !== userId) return;
      await requestJson("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      if (activeUserRef.current === userId) setFeedback({ text: "Đã bật thông báo đẩy cho thiết bị này.", kind: "success" });
    } catch (error) {
      if (activeUserRef.current === userId) setFeedback({ text: error instanceof Error ? error.message : "Không thể bật thông báo.", kind: "error" });
    } finally { pushRef.current = false; setPushBusy(false); }
  };

  const testPush = async () => {
    if (pushTestBusy) return;
    setPushTestBusy(true); setFeedback(null);
    try {
      const result = await requestJson<{ message: string }>("/api/notifications/push/test", { method: "POST" });
      setFeedback({ text: result.message, kind: "success" });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Không thể gửi thông báo thử.", kind: "error" });
    } finally { setPushTestBusy(false); }
  };

  const toggleSound = async () => {
    const next = !soundEnabledRef.current;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    try { window.localStorage.setItem(SOUND_SETTING_KEY, next ? "on" : "off"); } catch { /* Keep the setting for this session. */ }
    if (next) { await unlockSound(); playSound(); }
  };

  const { notifications: items, unreadCount: unread } = feed;
  const openSchedule = (id: string) => {
    setScheduleFor((current) => current === id ? null : id);
    const next = new Date(Date.now() + 60 * 60_000);
    setScheduleTime(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}T${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
    setScheduleRepeat("none");
  };
  return <div className="notification-center" ref={containerRef}>
    <button className="notification-trigger" type="button" onClick={() => { void unlockSound(); setOpen((current) => !current); if (!open) void load(); }} aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} aria-expanded={open} aria-controls="notification-panel">
      <Icon name="bell" size={18}/>{unread > 0 && <b aria-hidden="true">{unread > 99 ? "99+" : unread}</b>}
    </button>
    {feedback && createPortal(<div className={`notification-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</div>, document.body)}
    {open && <div className="notification-panel" id="notification-panel" role="region" aria-label="Thông báo">
      <div className="notification-panel-head">
        <div><strong>Thông báo</strong><small>{unread ? `${unread} chưa đọc` : "Đã xem tất cả"}</small></div>
        <div className="notification-panel-actions">
          <button type="button" className="text-button" onClick={() => void toggleSound()} aria-pressed={soundEnabled}>{soundEnabled ? "Tắt âm báo" : "Bật âm báo"}</button>
          <button type="button" className="text-button" disabled={pushBusy} onClick={() => void enablePush()}>{pushBusy ? "Đang bật…" : "Bật thông báo đẩy"}</button>
          <button type="button" className="text-button" disabled={pushTestBusy} onClick={() => void testPush()}>{pushTestBusy ? "Đang gửi…" : "Gửi thử tới thiết bị"}</button>
        </div>
      </div>
      <div className="notification-toolbar">
        <span className="notification-loading" role="status">{loading ? "Đang cập nhật…" : "40 thông báo gần nhất"}</span>
        <button type="button" className="text-button" disabled={!unread || Boolean(busy)} onClick={() => void mutate({ type: "read-all" })}>{busy === "read-all" ? "Đang lưu…" : "Đọc tất cả"}</button>
      </div>
      {loadError && <div className="notification-error" role="alert"><span>{loadError}</span><button type="button" className="text-button" disabled={loading || Boolean(busy)} onClick={() => void load()}>Thử lại</button></div>}
      <div className="notification-list" aria-busy={loading}>
        {loading && !items.length ? <p>Đang tải thông báo…</p> : items.length ? items.map((item) => {
          const seconds = Math.max(0, Math.ceil((Math.max(reminderAvailableAt(item), retryAt[item.id] ?? 0) - now) / 1_000));
          const reminding = busy === `remind:${item.id}`;
          return <article className={item.readAt ? "notification-item" : "notification-item unread"} key={item.id}>
            <button type="button" className="notification-content" disabled={Boolean(busy)} onClick={() => openNotification(item)}>
              <span><b>{item.title}</b><small>{item.body}</small></span><time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
            </button>
            <div className="notification-item-actions"><button type="button" className="notification-remind" disabled={Boolean(busy)} onClick={() => openSchedule(item.id)} aria-label={`Nhắc nhở lại: ${item.title}`} aria-expanded={scheduleFor === item.id}>
              <Icon name="bell" size={13}/><span>Nhắc nhở lại</span>
            </button></div>
            {item.scheduledAt && <small className="notification-scheduled">Đã hẹn: {formatTime(item.scheduledAt)}{item.scheduledRepeat && item.scheduledRepeat !== "none" ? ` · ${item.scheduledRepeat === "daily" ? "Mỗi ngày" : "Mỗi tuần"}` : ""}</small>}
            {scheduleFor === item.id && <div className="notification-schedule"><button type="button" className="secondary" disabled={Boolean(busy) || seconds > 0} onClick={() => void mutate({ type: "remind", id: item.id })}>{reminding ? "Đang gửi…" : seconds > 0 ? `Gửi ngay sau ${seconds}s` : "Gửi ngay"}</button><label>Hẹn ngày và giờ<input type="datetime-local" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)}/></label><label>Lặp lại<select value={scheduleRepeat} onChange={(event) => setScheduleRepeat(event.target.value as ReminderRepeat)}><option value="none">Một lần</option><option value="daily">Mỗi ngày</option><option value="weekly">Mỗi tuần</option></select></label><button type="button" className="primary" disabled={Boolean(busy) || !scheduleTime || Date.parse(scheduleTime) <= Date.now()} onClick={() => void mutate({ type: "schedule", id: item.id, scheduledAt: new Date(scheduleTime).toISOString(), repeat: scheduleRepeat })}>Đặt lịch nhắc</button></div>}
          </article>;
        }) : !loadError && <p className="notification-empty">Chưa có thông báo.</p>}
      </div>
    </div>}
  </div>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
