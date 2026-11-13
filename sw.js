// Service worker do painel: mostra notificações do sistema quando entra um pedido e abre o painel ao clicar.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "KRYPTO", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "KRYPTO", {
    body: data.body || "",
    icon: "/apple-touch-icon.png",
    badge: "/apple-touch-icon.png",
    tag: data.tag || "krypto-pedido",
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || "/admin.html#pedidos" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/admin.html#pedidos", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin + "/admin.html") && "focus" in client) { client.navigate(url).catch(() => {}); return client.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
