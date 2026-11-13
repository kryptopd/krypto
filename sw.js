// Service worker da KRYPTO: (1) notificações do sistema para o painel; (2) loja instalável com página de "sem conexão".
// Só navegações têm fallback offline; o resto da rede segue normal (nada de conteúdo antigo preso em cache).
const CACHE = "krypto-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("/offline.html")).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(fetch(req).catch(() => caches.match("/offline.html").then((r) => r || new Response("Sem conexão", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "KRYPTO", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "KRYPTO", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
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
