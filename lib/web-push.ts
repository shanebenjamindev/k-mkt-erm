import webpush from "web-push";
import { listPushSubscriptions } from "./workspace-repository";
import type { WorkspaceNotification } from "./types";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:workspace@example.com";

export function pushConfiguration() {
  return { configured: Boolean(publicKey && privateKey), publicKey: publicKey || null };
}

export async function sendPushNotifications(notifications: WorkspaceNotification[]) {
  if (!notifications.length || !publicKey || !privateKey) return { sent: 0, skipped: notifications.length };
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subscriptions = await listPushSubscriptions(notifications.map((item) => item.userId));
  const jobs = subscriptions.flatMap((subscription) => notifications.filter((item) => item.userId === subscription.userId).map(async (notification) => {
    const payload = JSON.stringify({ title: notification.title, body: notification.body, url: notification.taskId ? "/tasks" : "/" });
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
    return notification.id;
  }));
  const results = await Promise.allSettled(jobs);
  return { sent: results.filter((item) => item.status === "fulfilled").length, skipped: 0 };
}
