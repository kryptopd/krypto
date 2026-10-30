const { requireMethod, sendError, shippingConfig } = require("./_lib/supabase");
module.exports = function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(shippingConfig());
  } catch (error) { return sendError(res, error); }
};
