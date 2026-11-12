const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');

// GET /api/admin/alerts            -> interessados agrupados por produto
// DELETE /api/admin/alerts?product_id=ID -> marca como avisados (apaga a lista daquela peça)
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "DELETE"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const db = getSupabase();
    if (req.method === "DELETE") {
      const id = Number(req.query.product_id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ detail: "Produto inválido." });
      const { error } = await db.from("stock_alerts").delete().eq("product_id", id);
      if (error) throw error;
      return res.status(204).end();
    }
    const { data, error } = await db.from("stock_alerts").select("id,product_id,email,color,size,created_at,products(name,stock)").order("created_at", { ascending: false }).limit(2000);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return res.status(200).json({ groups: [], missing_migration: true });
      throw error;
    }
    const groups = new Map();
    for (const row of data || []) {
      const g = groups.get(row.product_id) || { product_id: row.product_id, name: (row.products && row.products.name) || `Produto ${row.product_id}`, stock: row.products ? row.products.stock : 0, people: [] };
      g.people.push({ email: row.email, color: row.color, size: row.size, created_at: row.created_at });
      groups.set(row.product_id, g);
    }
    return res.status(200).json({ groups: [...groups.values()].sort((a, b) => b.people.length - a.people.length) });
  } catch (error) { return sendError(res, error); }
};
