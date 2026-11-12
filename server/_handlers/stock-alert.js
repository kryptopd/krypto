const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');
const recent = new Map();

// POST /api/stock-alert { product_id, email, color?, size? } -> entra na lista "avise-me quando chegar"
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const b = req.body || {};
    if (String(b.website || "").trim()) return res.status(400).json({ detail: "Envio inválido." });
    const email = String(b.email || "").trim().toLowerCase();
    const productId = Number(b.product_id);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ detail: "Informe um e-mail válido." });
    if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ detail: "Produto inválido." });
    const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0];
    const now = Date.now();
    if (now - (recent.get(ip) || 0) < 3000) return res.status(429).json({ detail: "Aguarde um instante e tente de novo." });
    recent.set(ip, now);
    if (recent.size > 5000) recent.clear();
    const db = getSupabase();
    const { data: product, error: findError } = await db.from("products").select("id").eq("id", productId).eq("active", true).maybeSingle();
    if (findError) throw findError;
    if (!product) return res.status(404).json({ detail: "Produto não encontrado." });
    const row = { product_id: productId, email, color: String(b.color || "").trim().slice(0, 30), size: String(b.size || "").trim().slice(0, 20) };
    const { error } = await db.from("stock_alerts").insert(row);
    // Já estava na lista: tudo certo para o cliente.
    if (error && error.code !== "23505") {
      if (error.code === "42P01") return res.status(503).json({ detail: "O aviso ainda está sendo configurado. Tente novamente em breve." });
      throw error;
    }
    return res.status(201).json({ message: "Pronto! Avisaremos por e-mail quando a peça voltar." });
  } catch (e) { return sendError(res, e); }
};
