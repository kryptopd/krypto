const { getSupabase, sendError, requireMethod, requireAdmin, paymentMethods } = require("./_lib/supabase");
const S = require("./_lib/shipping");

// GET  /api/shipping                         -> informações públicas (frete grátis, formas de pagamento, estados atendidos)
// GET  /api/shipping?state=SP&items=12:2,15:1 -> cotação (valor, prazo, peso) calculada no servidor
// PUT  /api/shipping  (administrador)         -> salva as regras de frete
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "PUT"])) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const supabase = getSupabase();

    if (req.method === "PUT") {
      if (!(await requireAdmin(req, res))) return;
      const settings = S.sanitizeSettings(req.body || {});
      await S.saveSettings(supabase, settings);
      return res.status(200).json({ configured: true, settings });
    }

    const { configured, settings } = await S.readSettings(supabase);
    if (!req.query.state) {
      return res.status(200).json({
        configured, name: settings.name,
        free_shipping: configured && settings.free_shipping,
        free_over_cents: configured ? settings.free_over_cents : 0,
        enabled_states: configured ? S.UFS.filter((uf) => settings.states[uf].enabled) : [],
        payment_methods: paymentMethods()
      });
    }
    if (!configured) {
      return res.status(503).json({ detail: "A loja ainda não configurou o frete. Tente novamente em breve." });
    }
    const items = S.parseItemsParam(req.query.items);
    if (!items.length) return res.status(400).json({ detail: "Sua sacola está vazia." });
    const lines = await S.priceLines(supabase, items);
    return res.status(200).json(S.computeQuote(settings, req.query.state, lines));
  } catch (error) { return sendError(res, error); }
};
