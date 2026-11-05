const { getSupabase, sendError, requireMethod, getSiteUrl, shippingConfig, pixConfig } = require("./_lib/supabase");

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  let createdPublicId = null;
  try {
    const body = req.body || {}, customer = body.customer || {}, item = body.item || {};
    // Sem o campo, mantém o comportamento anterior (Mercado Pago).
    const paymentMethod = body.payment_method === "pix" ? "pix" : "mercadopago";
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (paymentMethod === "mercadopago" && !accessToken) {
      const error = new Error("O pagamento por cartão ainda não está disponível. Escolha PIX ou tente novamente mais tarde.");
      error.statusCode = 503; throw error;
    }
    const required = ["name", "email", "phone", "address", "address_number", "city", "state", "postal_code"];
    for (const field of required) {
      if (!String(customer[field] || "").trim()) return res.status(400).json({ detail: `Preencha o campo obrigatório: ${field}.` });
    }
    if (!validEmail(String(customer.email).trim())) return res.status(400).json({ detail: "Informe um e-mail válido." });
    if (String(customer.postal_code).replace(/\D/g, "").length !== 8) return res.status(400).json({ detail: "Informe um CEP válido com 8 números." });
    const phoneDigits = String(customer.phone).replace(/\D/g, "").length;
    if (phoneDigits < 10 || phoneDigits > 13) return res.status(400).json({ detail: "Informe um telefone válido com DDD." });
    if (body.privacy_consent !== true) return res.status(400).json({ detail: "É necessário confirmar a leitura da Política de Privacidade para concluir o pedido." });
    const productId = Number(item.product_id), quantity = Number(item.quantity);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ detail: "Produto ou quantidade inválidos." });
    }
    const shipping = shippingConfig(), supabase = getSupabase();
    const { error: expireError } = await supabase.rpc("expire_krypto_orders");
    if (expireError) throw expireError;
    const { data, error } = await supabase.rpc("create_krypto_order", {
      p_customer: {
        name: String(customer.name).trim().slice(0, 160), email: String(customer.email).trim().slice(0, 254),
        phone: String(customer.phone).trim().slice(0, 40), address: String(customer.address).trim().slice(0, 200),
        address_number: String(customer.address_number).trim().slice(0, 30), complement: String(customer.complement || "").trim().slice(0, 120),
        city: String(customer.city).trim().slice(0, 100), state: String(customer.state).trim().slice(0, 60),
        postal_code: String(customer.postal_code).replace(/\D/g, "").slice(0, 8)
      },
      p_item: { product_id: productId, quantity, size: String(item.size || "").trim().slice(0, 20) },
      p_shipping_cents: shipping.shipping_cents,
      p_privacy_acknowledged: true
    });
    if (error) {
      if (/OUT_OF_STOCK/.test(error.message || "")) return res.status(409).json({ detail: "Estoque insuficiente para essa quantidade." });
      if (/PRODUCT_NOT_FOUND/.test(error.message || "")) return res.status(404).json({ detail: "Produto não encontrado ou indisponível." });
      if (/INVALID_SIZE/.test(error.message || "")) return res.status(400).json({ detail: "Tamanho inválido para esse produto." });
      throw error;
    }
    const order = Array.isArray(data) ? data[0] : data;
    createdPublicId = order.public_id;

    if (paymentMethod === "pix") {
      // Marca o pedido como PIX (prazo de reserva maior e confirmação manual pelo painel).
      const { error: methodError } = await supabase.from("orders")
        .update({ payment_method: "pix" }).eq("public_id", order.public_id);
      if (methodError) {
        console.error("[KRYPTO] Não foi possível marcar o pedido como PIX. A migração 20261105_pix.sql foi executada?", methodError);
        await supabase.rpc("cancel_krypto_order", { p_public_id: order.public_id, p_reason: "payment_setup_failed" });
        createdPublicId = null;
        return res.status(503).json({ detail: "O pagamento por PIX está sendo configurado. Tente novamente em instantes ou escolha outra forma de pagamento." });
      }
      createdPublicId = null;
      const pix = pixConfig();
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({
        id: order.public_id, payment_method: "pix", subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents, total_cents: order.total_cents,
        pix_key: pix.pix_key, pix_reserve_hours: pix.pix_reserve_hours
      });
    }

    const siteUrl = getSiteUrl(req);
    const prefResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { id: String(productId), title: order.item_name, quantity, currency_id: "BRL", unit_price: order.unit_price_cents / 100 },
          ...(shipping.shipping_cents > 0 ? [{ id: "shipping", title: shipping.shipping_name, quantity: 1, currency_id: "BRL", unit_price: shipping.shipping_cents / 100 }] : [])
        ],
        payer: { name: String(customer.name).trim().slice(0, 160), email: String(customer.email).trim() },
        external_reference: order.public_id,
        notification_url: `${siteUrl}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${siteUrl}/pedido.html?order=${encodeURIComponent(order.public_id)}&return=success`,
          pending: `${siteUrl}/pedido.html?order=${encodeURIComponent(order.public_id)}&return=pending`,
          failure: `${siteUrl}/pedido.html?order=${encodeURIComponent(order.public_id)}&return=failure`
        },
        auto_return: "approved",
        statement_descriptor: "KRYPTO",
        metadata: { order_public_id: order.public_id }
      })
    });
    const preference = await prefResponse.json().catch(() => ({}));
    if (!prefResponse.ok || !preference.id || !preference.init_point) {
      await supabase.rpc("cancel_krypto_order", { p_public_id: order.public_id, p_reason: "payment_setup_failed" });
      createdPublicId = null;
      console.error("[KRYPTO] Mercado Pago preference error", preference);
      return res.status(502).json({ detail: "Não foi possível iniciar o pagamento. Nenhuma cobrança foi concluída; tente novamente." });
    }
    const { error: saveError } = await supabase.from("orders")
      .update({ mp_preference_id: preference.id })
      .eq("public_id", order.public_id);
    if (saveError) throw saveError;
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({
      id: order.public_id, payment_method: "mercadopago", subtotal_cents: order.subtotal_cents,
      shipping_cents: order.shipping_cents, total_cents: order.total_cents,
      checkout_url: preference.init_point
    });
  } catch (error) {
    if (createdPublicId) {
      try { await getSupabase().rpc("cancel_krypto_order", { p_public_id: createdPublicId, p_reason: "payment_setup_failed" }); } catch (_) {}
    }
    return sendError(res, error);
  }
};
