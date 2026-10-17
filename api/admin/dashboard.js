const { getSupabase, sendError, requireMethod, requireAdmin } = require("../_lib/supabase");

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
      pending_count: allOrders.filter((o) => o.status === "aguardando").length,
      sales_cents: allOrders.filter((o) => o.status !== "cancelado")
        .reduce((sum, o) => sum + Number(o.total_cents || 0), 0)
    };
    return res.status(200).json({ stats, products, orders });
  } catch (error) {
    return sendError(res, error);
  }
};