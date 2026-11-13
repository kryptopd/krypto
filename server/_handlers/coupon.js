const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');
const { readStoreSettings, findCoupon } = require('../_lib/settings');
const tries = new Map();

// GET /api/coupon?code=ABC -> { valid, code, percent }. Não revela a lista de cupons existentes.
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0], now = Date.now();
    const list = (tries.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    list.push(now); tries.set(ip, list);
    if (tries.size > 5000) tries.clear();
    if (list.length > 20) return res.status(429).json({ detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    res.setHeader("Cache-Control", "no-store");
    const coupon = findCoupon(await readStoreSettings(getSupabase()), req.query.code);
    if (!coupon) return res.status(404).json({ valid: false, detail: "Cupom inválido ou expirado." });
    return res.status(200).json({ valid: true, code: coupon.code, percent: coupon.percent });
  } catch (error) { return sendError(res, error); }
};
