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
    const columns = "id,name,category,price_cents,stock,sizes,image_url,images,description,active";
    let { data, error } = await supabase.from("products").select(columns).eq("active", true).order("created_at", { ascending: false });
    // Banco ainda sem a migração das fotos: a vitrine continua abrindo com a foto única.
    if (error && ["42703", "PGRST204"].includes(error.code)) {
      ({ data, error } = await supabase.from("products").select("id,name,category,price_cents,stock,sizes,image_url,description,active").eq("active", true).order("created_at", { ascending: false }));
    }
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    return sendError(res, error);
  }
};
