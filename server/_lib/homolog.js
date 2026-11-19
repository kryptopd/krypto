// Modo homologação (opções de desenvolvedor).
// Quando uma conta de desenvolvedor (customers.is_developer) liga o modo, um cookie HttpOnly marca o navegador.
// A partir daí TODA requisição que grava algo (POST, PUT, PATCH, DELETE) é interceptada aqui, antes de chegar aos
// handlers de produção: nada vai para o banco, não gasta estoque, não notifica o administrador e não aparece no painel.
// O pedido é apenas simulado (mesmas regras de preço, frete e desconto) e fica guardado só no navegador de quem testa.
// O servidor sempre confere se a sessão é mesmo de um desenvolvedor: o cookie sozinho não vale nada.
const crypto = require("node:crypto");
const { getSupabase, pixConfig } = require("./supabase");
const { buildPixPayload } = require("./pix");
const C = require("./customer");
const S = require("./shipping");
const { readStoreSettings, findCoupon } = require("./settings");

const COOKIE = "krypto_homolog";
const MAX_AGE = 8 * 3600;
// Rotas que continuam funcionando normalmente mesmo com o modo ligado (entrar, sair, ligar/desligar e consultas).
const PASS = new Set(["account/login", "account/logout", "account/homolog", "orders/lookup"]);

const fail = (status, detail) => Object.assign(new Error(detail), { statusCode: status });
const cookieOn = (req) => new RegExp(`(?:^|;\\s*)${COOKIE}=1(?:;|$)`).test(String(req.headers.cookie || ""));

// Liga (on=true) ou apaga (on=false) o cookie, sem sobrescrever outro Set-Cookie já definido na resposta.
function setCookie(res, req, on) {
  const secure = !/^(localhost|127\.0\.0\.1)/.test(String(req.headers.host || "")) ? "; Secure" : "";
  const value = `${COOKIE}=${on ? "1" : ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${on ? MAX_AGE : 0}${secure}`;
  res.setHeader("Set-Cookie", [].concat(res.getHeader("Set-Cookie") || [], value));
}

// true só se a sessão é de uma conta de desenvolvedor. Erros de banco sobem (quem chama bloqueia a gravação).
async function isDeveloper(req) {
  const db = getSupabase();
  const id = await C.readSession(db, req);
  if (!id) return false;
  const { data, error } = await db.from("customers").select("is_developer").eq("id", id).maybeSingle();
  if (error) throw error;
  return Boolean(data && data.is_developer);
}

async function simulateOrder(req) {
  const body = req.body || {}, customer = body.customer || {};
  const paymentMethod = body.payment_method === "pix" ? "pix" : "mercadopago";
  const required = { name: "nome", email: "e-mail", phone: "telefone", address: "endereço", address_number: "número", city: "cidade", state: "estado", postal_code: "CEP" };
  for (const [field, label] of Object.entries(required)) {
    if (!String(customer[field] || "").trim()) throw fail(400, `Preencha o campo obrigatório: ${label}.`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email))) throw fail(400, "Informe um e-mail válido.");
  const uf = S.normalizeUf(customer.state);
  if (!uf) throw fail(400, "Informe o estado com a sigla (UF), por exemplo SP.");
  if (String(customer.postal_code).replace(/\D/g, "").length !== 8) throw fail(400, "Informe um CEP válido com 8 números.");
  if (body.privacy_consent !== true) throw fail(400, "É necessário confirmar a leitura da Política de Privacidade para concluir o pedido.");
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 20) throw fail(400, "Sua sacola está vazia ou tem itens demais.");
  const items = rawItems.map((r) => ({ product_id: Number(r && r.product_id), quantity: Number(r && r.quantity), size: String((r && r.size) || "").trim().slice(0, 20), color: String((r && r.color) || "").trim().slice(0, 30) }));
  for (const it of items) {
    if (!Number.isSafeInteger(it.product_id) || it.product_id < 1 || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 10) throw fail(400, "Produto ou quantidade inválidos na sacola.");
  }

  const db = getSupabase();
  const { configured, settings } = await S.readSettings(db);
  if (!configured) throw fail(503, "A loja ainda não configurou o frete. Tente novamente em breve.");
  const lines = await S.priceLines(db, items);
  const quote = await S.resolveQuote(settings, String(body.shipping_option || ""), customer, uf, lines);
  const store = await readStoreSettings(db);
  const pixPercent = paymentMethod === "pix" ? Number(store.pix_discount_percent || 0) : 0;
  let couponPercent = 0;
  if (String(body.coupon || "").trim()) {
    const coupon = findCoupon(store, body.coupon);
    if (!coupon) throw fail(400, "Esse cupom não é válido ou expirou. Remova-o ou confira o código.");
    couponPercent = coupon.percent;
  }
  const subtotal = lines.reduce((n, l) => n + l.price_cents * l.quantity, 0);
  const discount = Math.round(subtotal * Math.min(50, pixPercent + couponPercent) / 100);
  const total = subtotal - discount + quote.shipping_cents;

  const names = new Map();
  const { data: prods } = await db.from("products").select("id,name").in("id", [...new Set(items.map((i) => i.product_id))]);
  (prods || []).forEach((p) => names.set(p.id, p.name));
  const publicId = `HOM${crypto.randomBytes(3).toString("hex").toUpperCase()}`;   // "HOM" nunca existe de verdade (só A-F e números)
  const order = {
    public_id: publicId, status: "aguardando_pagamento", payment_status: "pending", payment_method: paymentMethod,
    subtotal_cents: subtotal, shipping_cents: quote.shipping_cents, discount_cents: discount, total_cents: total,
    created_at: new Date().toISOString(), tracking_code: null, shipping_provider: null,
    shipping_service: String(quote.name || ""), shipping_days: quote.days || null, events: [], homologation: true,
    items: items.map((it, i) => ({ product_id: it.product_id, name: names.get(it.product_id) || `Produto ${it.product_id}`, quantity: it.quantity, unit_price_cents: lines[i].price_cents, size: it.size, color: it.color }))
  };
  const out = { id: publicId, payment_method: paymentMethod, subtotal_cents: subtotal, shipping_cents: quote.shipping_cents, discount_cents: discount, total_cents: total, homologation: true, order };
  if (paymentMethod === "pix") {
    try {
      const pix = pixConfig();
      Object.assign(order, { pix_key: pix.pix_key, pix_reserve_hours: pix.pix_reserve_hours, pix_payload: buildPixPayload({ key: pix.pix_key, amountCents: total, merchantName: pix.merchant_name, merchantCity: pix.merchant_city, txid: publicId }) });
      Object.assign(out, { pix_key: order.pix_key, pix_reserve_hours: order.pix_reserve_hours, pix_payload: order.pix_payload });
    } catch (_) { /* PIX não configurado: segue sem a chave */ }
  } else out.checkout_url = `/pedido.html?order=${publicId}&return=pending`;
  return { status: 201, body: out };
}

async function simulate(req, route) {
  if (route === "orders") return simulateOrder(req);
  const body = req.body || {};
  if (route === "account/me") {
    const A = require("../_handlers/account");
    const db = getSupabase(), id = await C.readSession(db, req);
    const { data, error } = await db.from("customers").select("*").eq("id", id).maybeSingle();
    if (error || !data) throw fail(401, "Sessão expirada. Entre novamente.");
    const merged = { ...data };   // só na resposta: nada é gravado
    if (body.name !== undefined) merged.name = String(body.name || "").trim().slice(0, 160);
    if (body.phone !== undefined) merged.phone = String(body.phone || "").trim().slice(0, 40);
    if (body.address !== undefined) merged.address = A.cleanAddress(body.address);
    return { status: 200, body: { ...A.publicCustomer(merged), homologation: true } };
  }
  if (route === "account/favorites") {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 200);
    return { status: 200, body: { favorites: ids, homologation: true } };
  }
  return { status: 200, body: { ok: true, homologation: true } };
}

// Retorna true se já respondeu (a gravação foi interceptada); false se a requisição segue normalmente.
async function guard(req, res, route) {
  if (!cookieOn(req) || PASS.has(route)) return false;
  try {
    if (!(await isDeveloper(req))) return false;       // cookie sem sessão de desenvolvedor não vale nada
  } catch (error) {
    console.error("[KRYPTO homologação] não foi possível confirmar o modo", error);
    res.status(503).json({ detail: "Não foi possível confirmar o modo homologação. Nada foi gravado. Tente de novo." });
    return true;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Krypto-Homologation", "1");
  if (route.startsWith("admin/")) { res.status(403).json({ detail: "Modo homologação ativo: o painel de administração fica somente leitura." }); return true; }
  if (route === "account/register") { res.status(403).json({ detail: "Modo homologação ativo: não é possível criar contas." }); return true; }
  try {
    const out = await simulate(req, route);
    res.status(out.status).json(out.body);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error("[KRYPTO homologação]", error);
    res.status(status).json({ detail: status === 500 ? "Erro ao simular na homologação. Nada foi gravado." : error.message });
  }
  return true;
}

module.exports = { guard, cookieOn, setCookie, isDeveloper };
