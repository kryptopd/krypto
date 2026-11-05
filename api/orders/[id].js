const { getSupabase, sendError, requireMethod, pixConfig } = require("../_lib/supabase");
const BASE_COLUMNS = "public_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,created_at,tracking_code,shipping_provider";
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
    const result = { ...data, payment_method: data.payment_method || "mercadopago" };
    if (result.payment_method === "pix" && result.status === "aguardando_pagamento" && result.payment_status === "pending") {
      const pix = pixConfig();
      result.pix_key = pix.pix_key;
      result.pix_reserve_hours = pix.pix_reserve_hours;
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (error) { return sendError(res, error); }
};
