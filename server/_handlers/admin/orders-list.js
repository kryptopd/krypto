const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');

// GET /api/admin/orders?q=&status=a,b&payment=&method=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&per=20[&export=csv]
// Lista pedidos com busca, filtros e paginação. Com export=csv devolve a planilha (até 5.000 pedidos).
const STATUSES = ["aguardando", "aguardando_pagamento", "confirmado", "preparando", "enviado", "entregue", "cancelado", "expirado"];
const PAYMENTS = ["pending", "approved", "rejected", "cancelled", "refunded", "charged_back", "expired"];
const day = (v, end) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? `${v}T${end ? "23:59:59.999" : "00:00:00"}-03:00` : null);   // dias no horário de Brasília

function itemsText(items) {
  return (Array.isArray(items) ? items : []).map((i) => `${i.quantity}x ${i.name}${i.color ? ` - ${i.color}` : ""}${i.size ? ` (${i.size})` : ""}`).join(", ");
}
const csvCell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
const reais = (c) => (Number(c || 0) / 100).toFixed(2).replace(".", ",");

function toCsv(rows) {
  const head = ["Pedido", "Data", "Cliente", "E-mail", "Telefone", "Endereço", "Número", "Complemento", "Cidade", "UF", "CEP", "Itens", "Subtotal", "Frete", "Desconto", "Total", "Cupom", "Forma de pagamento", "Status do pagamento", "Status", "Frete escolhido", "Rastreio"];
  const lines = rows.map((o) => [
    o.public_id, new Date(o.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), o.customer_name, o.email, o.phone, o.address, o.address_number, o.complement, o.city, o.state, o.postal_code,
    itemsText(o.items), reais(o.subtotal_cents), reais(o.shipping_cents), reais(o.discount_cents), reais(o.total_cents), o.coupon_code || "",
    o.payment_method === "pix" ? "PIX" : "Mercado Pago", o.payment_status, o.status, o.shipping_service || "", `${o.shipping_provider || ""} ${o.tracking_code || ""}`.trim()
  ].map(csvCell).join(";"));
  return `﻿${head.map(csvCell).join(";")}\r\n${lines.join("\r\n")}\r\n`;
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const db = getSupabase(), qs = req.query;
    const statuses = String(qs.status || "").split(",").map((s) => s.trim()).filter((s) => STATUSES.includes(s));
    const payment = PAYMENTS.includes(qs.payment) ? qs.payment : "";
    const method = ["pix", "mercadopago"].includes(qs.method) ? qs.method : "";
    const from = day(qs.from, false), to = day(qs.to, true);
    const term = String(qs.q || "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
    const apply = (query, withStatus = true) => {
      if (withStatus && statuses.length) query = query.in("status", statuses);
      if (payment) query = query.eq("payment_status", payment);
      if (method) query = query.eq("payment_method", method);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (term) query = query.or(`public_id.ilike.%${term}%,customer_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      return query;
    };

    if (qs.export === "csv") {
      const { data, error } = await apply(db.from("orders").select("*")).order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="pedidos-krypto-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(toCsv(data || []));
    }

    const per = Math.min(100, Math.max(5, Number(qs.per) || 20)), page = Math.max(1, Number(qs.page) || 1);
    const { data, count, error } = await apply(db.from("orders").select("*", { count: "exact" })).order("created_at", { ascending: false }).range((page - 1) * per, page * per - 1);
    if (error) throw error;
    // Contagem por status (respeita os outros filtros, não o de status) para as abas do painel.
    const { data: statusRows } = await apply(db.from("orders").select("status"), false).limit(5000);
    const counts = {};
    (statusRows || []).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const orders = (data || []).map((o) => ({ ...o, items_raw: Array.isArray(o.items) ? o.items : [], items: itemsText(o.items) }));
    return res.status(200).json({ orders, total: count || 0, page, per, pages: Math.max(1, Math.ceil((count || 0) / per)), counts });
  } catch (error) { return sendError(res, error); }
};
