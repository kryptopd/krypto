const { getSupabase, sendError, requireMethod, pixConfig } = require('../../_lib/supabase');
const { buildPixPayload } = require('../../_lib/pix');
const BASE_COLUMNS = "public_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,created_at,tracking_code,shipping_provider,items";

// Dados públicos do pedido (sem endereço, telefone ou e-mail). Usado por pedido.html e pelo painel "Meus pedidos".
function publicOrder(row) {
  const result = {
    public_id: row.public_id, status: row.status, payment_status: row.payment_status,
    subtotal_cents: row.subtotal_cents, shipping_cents: row.shipping_cents, total_cents: row.total_cents,
    created_at: row.created_at, tracking_code: row.tracking_code, shipping_provider: row.shipping_provider,
    payment_method: row.payment_method || "mercadopago",
    items: (Array.isArray(row.items) ? row.items : []).map((i) => ({ name: i.name, quantity: i.quantity, size: i.size || "" }))
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
    let { data, error } = await supabase.from("orders").select(`${BASE_COLUMNS},payment_method`).eq("public_id", publicId).maybeSingle();
    // 42703 = coluna inexistente: banco ainda sem a migração do PIX; segue como pedido Mercado Pago.
    if (error && error.code === "42703") {
      ({ data, error } = await supabase.from("orders").select(BASE_COLUMNS).eq("public_id", publicId).maybeSingle());
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ detail: "Pedido não encontrado." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(publicOrder(data));
  } catch (error) { return sendError(res, error); }
};
module.exports.publicOrder = publicOrder;
module.exports.BASE_COLUMNS = BASE_COLUMNS;
