const { getSupabase, sendError, requireMethod, requireAdmin } = require("../../_lib/supabase");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["PATCH"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.query.id);
    const status = String((req.body || {}).status || "");
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ detail: "ID inválido." });
    if (!["aguardando", "confirmado", "enviado", "cancelado"].includes(status)) {
      return res.status(400).json({ detail: "Status de pedido inválido." });
    }
    const { data, error } = await getSupabase().from("orders").update({ status }).eq("id", id).select("id,status").single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
};