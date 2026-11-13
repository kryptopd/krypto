const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');

// GET /api/admin/reports?days=30 -> vendas por dia, peças mais vendidas, formas de pagamento e totais.
// "Venda" = pedido com pagamento aprovado e que não foi cancelado/expirado. Dias no horário de Brasília.
const dayKey = (iso) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data, error } = await getSupabase().from("orders")
      .select("created_at,status,payment_status,payment_method,total_cents,discount_cents,items,coupon_code")
      .gte("created_at", since).order("created_at", { ascending: true }).limit(5000);
    if (error) {
      // Banco sem a migração (coluna coupon_code): tenta sem ela.
      if (!["42703", "PGRST204"].includes(error.code)) throw error;
      const retry = await getSupabase().from("orders").select("created_at,status,payment_status,payment_method,total_cents,items").gte("created_at", since).limit(5000);
      if (retry.error) throw retry.error;
      return res.status(200).json(build(retry.data || [], days));
    }
    return res.status(200).json(build(data || [], days));
  } catch (error) { return sendError(res, error); }
};

function build(orders, days) {
  const sales = orders.filter((o) => o.payment_status === "approved" && !["cancelado", "expirado"].includes(o.status));
  // Uma barra por dia, inclusive dias sem venda.
  const daily = new Map();
  for (let i = days - 1; i >= 0; i--) daily.set(dayKey(new Date(Date.now() - i * 24 * 3600 * 1000).toISOString()), { date: "", revenue_cents: 0, orders: 0 });
  for (const [key, v] of daily) v.date = key;
  const products = new Map(), coupons = new Map(), methods = { pix: { orders: 0, revenue_cents: 0 }, mercadopago: { orders: 0, revenue_cents: 0 } };
  let revenue = 0, discount = 0;
  for (const o of sales) {
    revenue += Number(o.total_cents || 0); discount += Number(o.discount_cents || 0);
    const d = daily.get(dayKey(o.created_at)); if (d) { d.revenue_cents += Number(o.total_cents || 0); d.orders += 1; }
    const m = methods[o.payment_method === "pix" ? "pix" : "mercadopago"]; m.orders += 1; m.revenue_cents += Number(o.total_cents || 0);
    if (o.coupon_code) coupons.set(o.coupon_code, (coupons.get(o.coupon_code) || 0) + 1);
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const p = products.get(it.name) || { name: it.name, units: 0, revenue_cents: 0 };
      p.units += Number(it.quantity || 0); p.revenue_cents += Number(it.quantity || 0) * Number(it.unit_price_cents || 0);
      products.set(it.name, p);
    }
  }
  const byStatus = {};
  orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
  return {
    days,
    totals: { revenue_cents: revenue, paid_orders: sales.length, all_orders: orders.length, avg_ticket_cents: sales.length ? Math.round(revenue / sales.length) : 0, discount_cents: discount,
      conversion_paid: orders.length ? Math.round((sales.length / orders.length) * 100) : 0 },
    daily: [...daily.values()],
    top_products: [...products.values()].sort((a, b) => b.units - a.units || b.revenue_cents - a.revenue_cents).slice(0, 8),
    by_method: methods, by_status: byStatus,
    coupons: [...coupons.entries()].map(([code, orders]) => ({ code, orders })).sort((a, b) => b.orders - a.orders)
  };
}
