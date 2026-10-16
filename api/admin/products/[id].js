const { getSupabase, sendError, requireMethod, requireAdmin } = require("../_lib/supabase");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["PUT", "DELETE"])) return;
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.query.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ detail: "ID inválido." });
    const supabase = getSupabase();
    if (req.method === "DELETE") {
      // Desativa o produto para preservar o histórico de pedidos.
      const { error } = await supabase.from("products").update({ active: false }).eq("id", id);
      if (error) throw error;
      return res.status(204).end();
    }

    const body = req.body || {};
    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const price = Number(body.price);
    const stock = Number(body.stock);
    const imageUrl = String(body.image_url || "").trim();
    if (!name || !["Camisetas", "Moletons", "Acessórios"].includes(category) ||
        !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0 ||
        !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ detail: "Confira nome, categoria, preço, estoque e URL da imagem." });
    }
    const patch = {
      name: name.slice(0, 160), category, price_cents: Math.round(price * 100), stock,
      sizes: Array.isArray(body.sizes) ? body.sizes.map(String).map(s => s.trim()).filter(Boolean).slice(0, 20) : [],
      tag: String(body.tag || "").trim().slice(0, 40), image_url: imageUrl,
      description: String(body.description || "").trim().slice(0, 2000), active: true
    };
    const { data, error } = await supabase.from("products").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) {
    return sendError(res, error);
  }
};