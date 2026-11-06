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
        .reduce((sum, o) => sum + Number(o.total_cents || 0), 0)
    };
    // Se a migração ainda não foi executada, o painel continua abrindo e avisa na área de frete.
    let shipping = null, shippingError = null;
    try { shipping = await readSettings(supabase); } catch (e) { shippingError = e.message; }
    return res.status(200).json({ stats, products, orders, shipping, shipping_error: shippingError });
  } catch (error) {
    return sendError(res, error);
  }
};