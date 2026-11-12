const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');
const { sanitize, readStoreSettings, saveStoreSettings } = require('../../_lib/settings');

// GET /api/admin/settings -> configurações da loja · PUT -> salva (desconto PIX e códigos de análise)
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "PUT"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const supabase = getSupabase();
    if (req.method === "PUT") {
      const settings = sanitize(req.body || {});
      await saveStoreSettings(supabase, settings);
      return res.status(200).json(settings);
    }
    return res.status(200).json(await readStoreSettings(supabase));
  } catch (error) { return sendError(res, error); }
};
