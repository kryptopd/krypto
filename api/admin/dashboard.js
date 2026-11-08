const { getSupabase, sendError, requireMethod, requireAdmin } = require("../_lib/supabase");
const { readSettings } = require("../_lib/shipping");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    const supabase = getSupabase();
    const [productsResult, ordersResult] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100)
    ]);
    if (productsResult.error) throw productsResult.error;
    if (ordersResult.error) throw ordersResult.error;

    const products = productsResult.data || [];
    const orders = (ordersResult.data || []).map((order) => ({
      ...order,
      items: (order.items || []).map((item) =>
        `${item.quantity}x ${item.name}${item.size ? ` (${item.size})` : ""}`
      ).join(", ")
    }));
    const allOrders = orders;
    const stats = {
      product_count: products.filter((p) => p.active).length,
      order_count: allOrders.length,
      pending_count: allOrders.filter((o) => ["aguardando", "aguardando_pagamento"].includes(o.status)).length,
      sales_cents: allOrders.filter((o) => o.payment_status === "approved" && o.status !== "cancelado")
        .reduce((sum, o) => sum + Number(o.total_cents || 0), 0),
      low_stock_count: products.filter((p) => p.active && Number(p.stock) > 0 && Number(p.stock) <= 3).length,
      out_of_stock_count: products.filter((p) => p.active && Number(p.stock) === 0).length,
      units_in_stock: products.filter((p) => p.active).reduce((sum, p) => sum + Number(p.stock || 0), 0),
      average_ticket_cents: (() => {
        const paid = allOrders.filter((o) => o.payment_status === "approved" && o.status !== "cancelado");
        return paid.length ? Math.round(paid.reduce((sum, o) => sum + Number(o.total_cents || 0), 0) / paid.length) : 0;
      })()
    };
    // Se a migração ainda não foi executada, o painel continua abrindo e avisa na área de frete.
    // Categorias: se a migração ainda não rodou, o painel abre e avisa na aba Categorias.
    let categories = [], categoriesError = null;
    const categoriesResult = await supabase.from("categories").select("id,name,created_at").order("name", { ascending: true });
    if (categoriesResult.error) categoriesError = "Execute a migração 20261107_photos_sizes_categories.sql no Supabase para usar categorias e fotos.";
    else categories = categoriesResult.data || [];
    let shipping = null, shippingError = null;
    try { shipping = await readSettings(supabase); } catch (e) { shippingError = e.message; }
    return res.status(200).json({ stats, products, orders, categories, categories_error: categoriesError, shipping, shipping_error: shippingError });
  } catch (error) {
    return sendError(res, error);
  }
};