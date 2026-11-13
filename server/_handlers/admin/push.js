const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');
const P = require('../../_lib/push');

// GET    /api/admin/push                       -> { public_key, devices }
// POST   /api/admin/push { subscription, label } -> cadastra este aparelho
// POST   /api/admin/push { action: "test" }      -> envia uma notificação de teste
// DELETE /api/admin/push { endpoint }            -> remove este aparelho
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const db = getSupabase(), body = req.body || {};
    if (req.method === "GET") {
      const state = await P.ensureState(db);
      return res.status(200).json({ public_key: state.vapid.publicKey, devices: state.subs.length });
    }
    if (req.method === "DELETE") {
      const devices = await P.removeDevice(db, String(body.endpoint || ""));
      return res.status(200).json({ devices });
    }
    if (body.action === "test") {
      const result = await P.notifyAdmins(db, P.subject(req), { title: "KRYPTO · teste", body: "As notificações de pedidos estão funcionando neste aparelho.", url: "/admin.html#pedidos", tag: "krypto-test" });
      return res.status(200).json(result);
    }
    const devices = await P.addDevice(db, body.subscription, body.label);
    return res.status(201).json({ devices });
  } catch (error) { return sendError(res, error); }
};
