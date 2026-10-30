const { getSupabase, sendError, requireMethod } = require("../_lib/supabase");
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || "");
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ detail: "Não autorizado." });
  try {
    const { data, error } = await getSupabase().rpc("expire_krypto_orders");
    if (error) throw error;
    return res.status(200).json({ expired: Number(data || 0) });
  } catch (error) { return sendError(res, error); }
};
