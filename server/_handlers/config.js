const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');
const { readStoreSettings } = require('../_lib/settings');

// GET /api/config -> o que a vitrine precisa saber (desconto PIX e códigos de análise). Nada sensível.
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const s = await readStoreSettings(getSupabase());
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ pix_discount_percent: s.pix_discount_percent, ga_id: s.ga_id, pixel_id: s.pixel_id });
  } catch (error) { return sendError(res, error); }
};
