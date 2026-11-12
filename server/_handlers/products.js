const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');

// GET /api/products               -> peças ativas da vitrine
// GET /api/products?categories=1  -> categorias criadas no painel (mesma função: a Vercel gratuita limita a 12)
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const supabase = getSupabase();
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    if (req.query.categories) {
      const { data, error } = await supabase.from("categories").select("id,name").order("name", { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }
    // Tenta o conjunto completo de colunas e recua se o banco ainda não recebeu alguma migração.
    const sets = [
      "id,name,category,price_cents,stock,sizes,image_url,images,colors,variants,description,active,created_at",
      "id,name,category,price_cents,stock,sizes,image_url,images,colors,description,active,created_at",
      "id,name,category,price_cents,stock,sizes,image_url,images,description,active",
      "id,name,category,price_cents,stock,sizes,image_url,description,active"
    ];
    let data = null, error = null;
    for (const columns of sets) {
      ({ data, error } = await supabase.from("products").select(columns).eq("active", true).order("created_at", { ascending: false }));
      if (!error || !["42703", "PGRST204"].includes(error.code)) break;
    }
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    return sendError(res, error);
  }
};
