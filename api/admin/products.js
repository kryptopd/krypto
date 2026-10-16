const { getSupabase, sendError, requireMethod, requireAdmin } = require("../_lib/supabase");

function normalize(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const price = Number(body.price);
  const stock = Number(body.stock);
  const imageUrl = String(body.image_url || "").trim();
  if (!name || !["Camisetas", "Moletons", "Acessórios"].includes(category)) {
    throw Object.assign(new Error("Informe um nome e uma categoria válida."), { statusCode: 400 });
  }
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
    throw Object.assign(new Error("Preço ou estoque inválido."), { statusCode: 400 });
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw Object.assign(new Error("Informe uma URL de imagem válida."), { statusCode: 400 });
  }
  return {
    name: name.slice(0, 160),
    category,
    price_cents: Math.round(price * 100),
    stock,
    sizes: Array.isArray(body.sizes) ? body.sizes.map(String).map(s => s.trim()).filter(Boolean).slice(0, 20) : [],
    tag: String(body.tag || "").trim().slice(0, 40),
    image_url: imageUrl,
    description: String(body.description || "").trim().slice(0, 2000),
    active: true
  };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  if (!requireAdmin(req, res)) return;
  try {
    const product = normalize(req.body || {});
    const { data, error } = await getSupabase().from("products").insert(product).select("*").single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    return sendError(res, error);
  }
};