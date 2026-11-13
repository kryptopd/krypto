const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');
const { readStoreSettings, publicSettings } = require('../_lib/settings');

// GET /api/config -> o que a vitrine precisa saber (desconto PIX, contato, banner, análise). Nada sensível.
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const s = await readStoreSettings(getSupabase());
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(publicSettings(s));
  } catch (error) { return sendError(res, error); }
};
