const { getSupabase, sendError, requireMethod } = require("../_lib/supabase");
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  const publicId = String(req.query.id || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8,16}$/.test(publicId)) return res.status(400).json({ detail: "Código de pedido inválido." });
  try {
    const { data, error } = await getSupabase().from("orders")
      .select("public_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,created_at,tracking_code,shipping_provider")
      .eq("public_id", publicId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ detail: "Pedido não encontrado." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (error) { return sendError(res, error); }
};
