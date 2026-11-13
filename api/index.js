// KRYPTO API router: one Vercel Serverless Function dispatches to focused handlers.
// The actual business logic remains modular under server/_handlers (private to Vercel routing).
const handlers = {
  adminCatalog: require("../server/_handlers/admin/catalog"),
  adminDashboard: require("../server/_handlers/admin/dashboard"),
  adminOrder: require("../server/_handlers/admin/orders/[id]"),
  adminProducts: require("../server/_handlers/admin/products"),
  adminSettings: require("../server/_handlers/admin/settings"),
  adminAlerts: require("../server/_handlers/admin/alerts"),
  adminPush: require("../server/_handlers/admin/push"),
  config: require("../server/_handlers/config"),
  coupon: require("../server/_handlers/coupon"),
  stockAlert: require("../server/_handlers/stock-alert"),
  seo: require("../server/_handlers/seo"),
  adminReviews: require("../server/_handlers/admin/reviews"),
  adminSupport: require("../server/_handlers/admin/support"),
  adminSupportItem: require("../server/_handlers/admin/support/[id]"),
  authConfig: require("../server/_handlers/auth/config"),
  expireOrders: require("../server/_handlers/cron/expire-orders"),
  createOrder: require("../server/_handlers/orders"),
  getOrder: require("../server/_handlers/orders/[id]"),
  lookupOrders: require("../server/_handlers/orders/lookup"),
  products: require("../server/_handlers/products"),
  reviews: require("../server/_handlers/reviews"),
  shipping: require("../server/_handlers/shipping"),
  support: require("../server/_handlers/support"),
  mercadoPagoWebhook: require("../server/_handlers/webhooks/mercadopago")
};

function routePath(req) {
  // Vercel catch-all routes expose the matched segments as req.query.path.
  const fromQuery = req.query && req.query.path;
  if (Array.isArray(fromQuery)) return fromQuery.join("/").replace(/^\/+|\/+$/g, "");
  if (typeof fromQuery === "string") return fromQuery.replace(/^\/+|\/+$/g, "");
  const pathname = String(req.url || "").split("?")[0];
  return pathname.replace(/^\/api\/?/, "").replace(/^\/+|\/+$/g, "");
}

module.exports = async function handler(req, res) {
  const route = routePath(req);
  const segments = route.split("/").filter(Boolean);
  const method = String(req.method || "GET").toUpperCase();

  // Keep the original query parameters while supplying the dynamic :id expected by handlers.
  req.query = { ...(req.query || {}) };
  delete req.query.path;

  let target = null;
  if (route === "products") target = handlers.products;
  else if (route === "orders" && method === "POST") target = handlers.createOrder;
  else if (route === "orders/lookup" && method === "POST") target = handlers.lookupOrders;
  else if (segments.length === 2 && segments[0] === "orders" && method === "GET") {
    req.query.id = segments[1]; target = handlers.getOrder;
  }
  else if (route === "reviews") target = handlers.reviews;
  else if (route === "support") target = handlers.support;
  else if (route === "shipping") target = handlers.shipping;
  else if (route === "config") target = handlers.config;
  else if (route === "coupon") target = handlers.coupon;
  else if (route === "stock-alert") target = handlers.stockAlert;
  else if (route === "page/product") target = handlers.seo;
  else if (route === "page/sitemap") { req.query.kind = "sitemap"; target = handlers.seo; }
  else if (route === "page/robots") { req.query.kind = "robots"; target = handlers.seo; }
  else if (route === "auth/config") target = handlers.authConfig;
  else if (route === "cron/expire-orders") target = handlers.expireOrders;
  else if (route === "webhooks/mercadopago") target = handlers.mercadoPagoWebhook;
  else if (route === "admin/catalog") target = handlers.adminCatalog;
  else if (route === "admin/dashboard") target = handlers.adminDashboard;
  else if (route === "admin/products") target = handlers.adminProducts;
  else if (route === "admin/reviews") target = handlers.adminReviews;
  else if (route === "admin/support") target = handlers.adminSupport;
  else if (route === "admin/settings") target = handlers.adminSettings;
  else if (route === "admin/alerts") target = handlers.adminAlerts;
  else if (route === "admin/push") target = handlers.adminPush;
  else if (segments.length === 3 && segments[0] === "admin" && segments[1] === "orders" && ["PATCH", "DELETE"].includes(method)) {
    req.query.id = segments[2]; target = handlers.adminOrder;
  }
  else if (segments.length === 3 && segments[0] === "admin" && segments[1] === "support" && ["PATCH", "DELETE"].includes(method)) {
    req.query.id = segments[2]; target = handlers.adminSupportItem;
  }

  if (!target) return res.status(404).json({ detail: "Rota não encontrada." });
  return target(req, res);
};
