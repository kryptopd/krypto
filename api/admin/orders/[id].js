const { getSupabase, sendError, requireMethod, requireAdmin } = require("../../_lib/supabase");
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["PATCH"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.query.id), body = req.body || {};
    const status = String(body.status || "");
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ detail: "ID inválido." });
    const allowed = ["preparando", "enviado", "entregue", "cancelado"];
    if (!allowed.includes(status)) return res.status(400).json({ detail: "Status inválido. Pagamento é atualizado automaticamente pelo gateway." });
    const supabase = getSupabase();
    const { data: current, error: currentError } = await supabase.from("orders")
      .select("id,public_id,status,payment_status").eq("id", id).single();
    if (currentError) throw currentError;
    if (status !== "cancelado" && current.payment_status !== "approved")
      return res.status(409).json({ detail: "Só é possível preparar/enviar um pedido com pagamento aprovado." });
    if (status === "preparando" && current.status !== "confirmado" && current.status !== "preparando")
      return res.status(409).json({ detail: "O pedido precisa estar confirmado antes da preparação." });
    if ((status === "enviado" || status === "entregue") && !["confirmado", "preparando", "enviado", "entregue"].includes(current.status))
      return res.status(409).json({ detail: "Transição de status inválida." });
    if (status === "cancelado") {
      const { data, error } = await supabase.rpc("cancel_krypto_order", { p_public_id: current.public_id, p_reason: "admin_cancelled" });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result && result.refund_required) {
        return res.status(409).json({ detail: "O pagamento já foi aprovado. O pedido não foi cancelado automaticamente; faça o estorno no Mercado Pago e depois tente cancelar novamente." });
      }
      return res.status(200).json({ id, status: "cancelado" });
    }
    const patch = { status };
    if (body.tracking_code !== undefined) patch.tracking_code = String(body.tracking_code || "").trim().slice(0, 120);
    if (body.shipping_provider !== undefined) patch.shipping_provider = String(body.shipping_provider || "").trim().slice(0, 80);
    const { data, error } = await supabase.from("orders").update(patch).eq("id", id).select("id,status,tracking_code,shipping_provider").single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) { return sendError(res, error); }
};
