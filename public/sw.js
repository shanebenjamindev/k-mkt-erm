self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || "K-MKT Workspace", {
    body: payload.body || "Bạn có một cập nhật mới.",
    icon: "/icon",
    badge: "/icon",
    silent: false,
    vibrate: [120, 60, 120],
    renotify: true,
    data: { url: payload.url || "/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
