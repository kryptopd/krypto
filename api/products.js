const { getSupabase, sendError, requireMethod } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select("id,name,category,price_cents,stock,sizes,tag,image_url,description,active")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json(data || []);
  } catch (error) {
    return sendError(res, error);
  }
};