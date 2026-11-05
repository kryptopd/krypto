const { requireMethod, sendError, shippingConfig, paymentMethods } = require("./_lib/supabase");
module.exports = function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    // Também informa quais formas de pagamento estão disponíveis (evita criar mais uma função na Vercel).
    return res.status(200).json({ ...shippingConfig(), payment_methods: paymentMethods() });
  } catch (error) { return sendError(res, error); }
};
