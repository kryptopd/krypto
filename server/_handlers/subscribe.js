const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');
const { readStoreSettings } = require('../_lib/settings');
const recent = new Map();

// POST /api/subscribe { email, consent: true, source? } -> guarda o e-mail (com consentimento) e devolve o cupom de boas-vindas, se houver.
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const b = req.body || {};
    if (String(b.website || "").trim()) return res.status(400).json({ detail: "Envio inválido." });
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ detail: "Informe um e-mail válido." });
    if (b.consent !== true) return res.status(400).json({ detail: "Marque a caixa de consentimento para receber novidades." });
    const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0], now = Date.now();
    if (now - (recent.get(ip) || 0) < 3000) return res.status(429).json({ detail: "Aguarde um instante e tente de novo." });
    recent.set(ip, now); if (recent.size > 5000) recent.clear();
    const db = getSupabase();
    const store = await readStoreSettings(db);
    if (!store.newsletter_enabled) return res.status(404).json({ detail: "Cadastro indisponível no momento." });
    const { error } = await db.from("subscribers").insert({ email, source: String(b.source || "site").slice(0, 30) });
    if (error && error.code !== "23505") {
      if (error.code === "42P01") return res.status(503).json({ detail: "O cadastro ainda está sendo configurado. Tente novamente em breve." });
      throw error;
    }
    const coupon = store.welcome_coupon ? store.coupons.find((c) => c.code === store.welcome_coupon && c.active) : null;
    return res.status(201).json({ message: "Cadastro feito! Obrigado.", coupon: coupon ? { code: coupon.code, percent: coupon.percent, first_order: coupon.first_order } : null });
  } catch (e) { return sendError(res, e); }
};
