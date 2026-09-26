import webpush from "web-push";
import { createECDH } from "node:crypto";
import { listPushSubscriptions } from "./workspace-repository";
import type { WorkspaceNotification } from "./types";

// The browser receives the public key from the authenticated API, so a
// build-time NEXT_PUBLIC variable is no longer required for new deployments.
// Keep the old name as a fallback for installations that already use it.
const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "https://k-mkt-workspace.vercel.app";

function validVapidKey(key: string | undefined, expectedBytes: number) {
  if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) return false;
  try { return Buffer.from(key.replace(/-/g, "+").replace(/_/g, "/"), "base64").length === expectedBytes; }
  catch { return false; }
}

function validSubject(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" && Boolean(url.hostname)) || (url.protocol === "mailto:" && Boolean(url.pathname.includes("@")));
  } catch { return false; }
}

function matchingKeyPair(publicValue: string, privateValue: string) {
  try {
    const decode = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(decode(privateValue));
    return ecdh.getPublicKey().equals(decode(publicValue));
  } catch { return false; }
}

export function pushConfiguration() {
  const error = !publicKey || !privateKey
    ? "Server thiếu VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY."
    : !validVapidKey(publicKey, 65) || !validVapidKey(privateKey, 32)
      ? "Khóa VAPID trên server không đúng định dạng."
      : !matchingKeyPair(publicKey, privateKey)
        ? "Khóa công khai và khóa riêng VAPID trên server không khớp."
        : !validSubject(subject)
          ? "VAPID_SUBJECT trên server không hợp lệ."
          : null;
  return { configured: error === null, publicKey: error === null ? publicKey : null, error };
}

export async function sendPushNotifications(notifications: WorkspaceNotification[]) {
  if (!notifications.length || !pushConfiguration().configured || !publicKey || !privateKey) return { sent: 0, failed: 0, skipped: notifications.length, subscriptions: 0, reasons: [] as number[] };
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subscriptions = await listPushSubscriptions(notifications.map((item) => item.userId));
  const jobs = subscriptions.flatMap((subscription) => notifications.filter((item) => item.userId === subscription.userId).map(async (notification) => {
    const payload = JSON.stringify({ title: notification.title, body: notification.body, tag: notification.id, url: notification.taskId ? `/tasks?task=${encodeURIComponent(notification.taskId)}` : "/" });
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
    return notification.id;
  }));
  const results = await Promise.allSettled(jobs);
  const reasons = results.flatMap((item) => item.status === "rejected" ? [Number((item.reason as { statusCode?: number })?.statusCode) || 0] : []);
  return { sent: results.length - reasons.length, failed: reasons.length, skipped: notifications.length && !subscriptions.length ? notifications.length : 0, subscriptions: subscriptions.length, reasons };
}
