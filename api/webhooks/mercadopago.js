const crypto = require("node:crypto");
const { getSupabase, sendError, requireMethod } = require("../_lib/supabase");

function validSignature(req, dataId) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const signature = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  if (!secret || !signature || !requestId || !dataId) return false;
  const parts = Object.fromEntries(signature.split(",").map((p) => {
    const i = p.indexOf("="); return i < 0 ? ["", ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const type = String(req.query.type || (req.body || {}).type || "");
    const dataId = String(req.query["data.id"] || (req.body || {}).data?.id || "");
    if (type !== "payment" || !dataId) return res.status(200).json({ received: true, ignored: true });
    if (!validSignature(req, dataId)) return res.status(401).json({ detail: "Assinatura de webhook inválida." });
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return res.status(503).json({ detail: "Gateway não configurado." });
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payment = await paymentResponse.json().catch(() => ({}));
    if (!paymentResponse.ok) throw Object.assign(new Error("Não foi possível consultar o pagamento no gateway."), { statusCode: 502 });
    if (!payment.external_reference) return res.status(200).json({ received: true, ignored: true });
    const statusMap = { approved: "approved", rejected: "rejected", cancelled: "cancelled", refunded: "refunded", charged_back: "charged_back", in_process: "pending", pending: "pending" };
    const mapped = statusMap[payment.status] || "pending";
    const amountCents = Math.round(Number(payment.transaction_amount || 0) * 100);
    const { data, error } = await getSupabase().rpc("apply_krypto_payment", {
      p_public_id: String(payment.external_reference),
      p_payment_id: String(payment.id),
      p_payment_status: mapped,
      p_amount_cents: amountCents
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (result && result.refund_required && mapped === "approved") {
      const refund = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.id)}/refunds`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": `krypto-late-refund-${payment.id}` }, body: "{}"
      });
      if (!refund.ok) console.error("[KRYPTO] ATENÇÃO: pagamento tardio requer estorno manual", payment.id, payment.external_reference);
      else {
        try {
          await getSupabase().rpc("apply_krypto_payment", {
            p_public_id: String(payment.external_reference), p_payment_id: String(payment.id),
            p_payment_status: "refunded", p_amount_cents: amountCents
          });
        } catch (refundRecordError) { console.error("[KRYPTO] Não foi possível registrar estorno automático", refundRecordError); }
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) { return sendError(res, error); }
};
