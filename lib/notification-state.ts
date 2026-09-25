import type { WorkspaceNotification } from "./types";

export const NOTIFICATION_REMINDER_COOLDOWN_MS = 2 * 60_000;

export type NotificationFeed = {
  notifications: WorkspaceNotification[];
  unreadCount: number;
};

export function reminderAvailableAt(notification: Pick<WorkspaceNotification, "remindedAt">) {
  const remindedAt = notification.remindedAt ? Date.parse(notification.remindedAt) : NaN;
  return Number.isFinite(remindedAt) ? remindedAt + NOTIFICATION_REMINDER_COOLDOWN_MS : 0;
}

export function reminderRetryAfter(notification: Pick<WorkspaceNotification, "remindedAt">, now = Date.now()) {
  return Math.max(0, Math.ceil((reminderAvailableAt(notification) - now) / 1000));
}

export function notificationDocumentTitle(title: string, unreadCount: number) {
  const base = title.replace(/^(?:\(\d+\)\s*)+/, "") || "K-MKT Workspace";
  const count = Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0;
  return count > 0 ? `(${count}) ${base}` : base;
}

/** Preserve the server total, which may include unread notifications outside the feed window. */
export function readNotificationInFeed(feed: NotificationFeed, id: string, readAt = new Date().toISOString()): NotificationFeed {
  const unread = feed.notifications.some((item) => item.id === id && !item.readAt);
  if (!unread) return feed;
  return {
    notifications: feed.notifications.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item),
    unreadCount: Math.max(0, feed.unreadCount - 1)
  };
}

export function readAllNotificationsInFeed(feed: NotificationFeed, readAt = new Date().toISOString()): NotificationFeed {
  return {
    notifications: feed.notifications.map((item) => item.readAt ? item : { ...item, readAt }),
    unreadCount: 0
  };
}

export function notificationEventKey(notification: Pick<WorkspaceNotification, "id" | "remindedAt">) {
  return `${notification.id}:${notification.remindedAt ?? ""}`;
}
