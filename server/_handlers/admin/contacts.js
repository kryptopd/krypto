const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');
const crypto = require("node:crypto");
const C = require('../../_lib/customer');

// GET /api/admin/contacts[?export=csv]  -> interessados (newsletter) e clientes com conta
// POST /api/admin/contacts { customer_id, action: "reset_password" } -> gera uma senha temporária para você enviar ao cliente
// DELETE /api/admin/contacts?subscriber=ID -> remove um interessado (pedido de descadastro)
const csvCell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const db = getSupabase();
    if (req.method === "DELETE") {
      const id = Number(req.query.subscriber);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ detail: "ID inválido." });
      const { error } = await db.from("subscribers").delete().eq("id", id);
      if (error) throw error;
      return res.status(204).end();
    }
    if (req.method === "POST") {
      const b = req.body || {};
      if (b.action !== "reset_password" || !/^[0-9a-f-]{36}$/.test(String(b.customer_id || ""))) return res.status(400).json({ detail: "Pedido inválido." });
      const temp = crypto.randomBytes(6).toString("base64url");
      const { error } = await db.from("customers").update({ password_hash: C.hashPassword(temp), failed_logins: 0, locked_until: null }).eq("id", b.customer_id);
      if (error) throw error;
      return res.status(200).json({ temporary_password: temp });
    }
    const subs = await db.from("subscribers").select("id,email,source,created_at").order("created_at", { ascending: false }).limit(5000);
    const custs = await db.from("customers").select("id,email,name,phone,created_at,last_login_at").order("created_at", { ascending: false }).limit(5000);
    const missing = [subs.error, custs.error].some((e) => e && e.code === "42P01");
    if (req.query.export === "csv") {
      const rows = [["Tipo", "E-mail", "Nome", "Telefone", "Cadastro"], ...(subs.data || []).map((s) => ["Interessado", s.email, "", "", s.created_at]), ...(custs.data || []).map((c) => ["Cliente", c.email, c.name, c.phone, c.created_at])];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="contatos-krypto-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(`﻿${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`);
    }
    return res.status(200).json({ subscribers: subs.data || [], customers: custs.data || [], missing_migration: missing });
  } catch (error) { return sendError(res, error); }
};
