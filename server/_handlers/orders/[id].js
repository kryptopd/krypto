const { getSupabase, sendError, requireMethod, pixConfig } = require('../../_lib/supabase');
const { buildPixPayload } = require('../../_lib/pix');
const BASE_COLUMNS = "public_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,created_at,tracking_code,shipping_provider,items";

// Dados públicos do pedido (sem endereço, telefone ou e-mail). Usado por pedido.html e pelo painel "Meus pedidos".
function publicOrder(row, events) {
  const result = {
    public_id: row.public_id, status: row.status, payment_status: row.payment_status,
    subtotal_cents: row.subtotal_cents, shipping_cents: row.shipping_cents, total_cents: row.total_cents,
    created_at: row.created_at, tracking_code: row.tracking_code, shipping_provider: row.shipping_provider,
    payment_method: row.payment_method || "mercadopago",
    discount_cents: row.discount_cents || 0,
    shipping_service: row.shipping_service || "", shipping_days: row.shipping_days || null,
    // Linha do tempo do pedido (quando o banco já registra os eventos).
    events: (Array.isArray(events) ? events : []).map((e) => ({ status: e.status, note: e.note || "", at: e.created_at })),
    items: (Array.isArray(row.items) ? row.items : []).map((i) => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, unit_price_cents: i.unit_price_cents, size: i.size || "", color: i.color || "" }))
  };
  if (result.payment_method === "pix" && result.status === "aguardando_pagamento" && result.payment_status === "pending") {
    const pix = pixConfig();
    result.pix_key = pix.pix_key;
    result.pix_reserve_hours = pix.pix_reserve_hours;
    // Copia e Cola com o valor exato já dentro: o banco abre o pagamento com o total preenchido.
    result.pix_payload = buildPixPayload({
      key: pix.pix_key, amountCents: row.total_cents, merchantName: pix.merchant_name,
      merchantCity: pix.merchant_city, txid: row.public_id
    });
  }
  return result;
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  const publicId = String(req.query.id || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8,16}$/.test(publicId)) return res.status(400).json({ detail: "Código de pedido inválido." });
  try {
    const supabase = getSupabase();
    // Tenta as colunas mais novas e recua se o banco ainda não recebeu a migração.
    const sets = [`${BASE_COLUMNS},id,payment_method,discount_cents,shipping_service,shipping_days`, `${BASE_COLUMNS},payment_method,discount_cents`, `${BASE_COLUMNS},payment_method`, BASE_COLUMNS];
    let data = null, error = null;
    for (const columns of sets) {
      ({ data, error } = await supabase.from("orders").select(columns).eq("public_id", publicId).maybeSingle());
      if (!error || error.code !== "42703") break;
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ detail: "Pedido não encontrado." });
    res.setHeader("Cache-Control", "no-store");
    let events = [];
    if (data.id) { const ev = await supabase.from("order_events").select("status,note,created_at").eq("order_id", data.id).order("created_at", { ascending: true }); if (!ev.error) events = ev.data || []; }
    return res.status(200).json(publicOrder(data, events));
  } catch (error) { return sendError(res, error); }
};
module.exports.publicOrder = publicOrder;
module.exports.BASE_COLUMNS = BASE_COLUMNS;
