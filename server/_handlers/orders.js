const { getSupabase, sendError, requireMethod, getSiteUrl, pixConfig } = require('../_lib/supabase');
const { buildPixPayload } = require('../_lib/pix');
const S = require('../_lib/shipping');
const { readStoreSettings, findCoupon } = require('../_lib/settings');
const Push = require('../_lib/push');
const Customer = require('../_lib/customer');

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
async function lowStockAlert(supabase, req, store, orderItems) {
  try {
    const threshold = Number(store.low_stock_threshold == null ? 3 : store.low_stock_threshold);
    const ids = [...new Set(orderItems.map((l) => l.product_id))];
    const { data, error } = await supabase.from("products").select("id,name,stock,variants").in("id", ids);
    if (error || !data) return { sent: 0 };
    const low = [];
    for (const line of orderItems) {
      const p = data.find((x) => x.id === line.product_id); if (!p) continue;
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const v = variants.find((x) => (x.color || "") === (line.color || "") && (x.size || "") === (line.size || ""));
      const left = variants.length ? (v ? Number(v.stock) : null) : Number(p.stock);
      if (left !== null && left <= threshold) low.push(`${p.name}${[line.color, line.size].filter(Boolean).length ? ` (${[line.color, line.size].filter(Boolean).join(", ")})` : ""}: ${left === 0 ? "esgotou" : `restam ${left}`}`);
    }
    if (!low.length) return { sent: 0 };
    return await Push.notifyAdmins(supabase, Push.subject(req), { title: "Estoque baixo", body: low.slice(0, 3).join(" · "), url: "/admin.html#produtos", tag: "estoque-baixo" });
  } catch (e) { return { sent: 0 }; }
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  let createdPublicId = null;
  try {
    // Compra sem cadastro: nada é gravado no Supabase Auth. O pedido guarda nome, e-mail e endereço só para entrega.
    const body = req.body || {}, customer = body.customer || {};
    if (String(body.website || "").trim()) return res.status(400).json({ detail: "Requisição inválida." }); // campo isca anti-robô
    // Sem o campo, mantém o comportamento anterior (Mercado Pago).
    const paymentMethod = body.payment_method === "pix" ? "pix" : "mercadopago";
    // Valida a configuração do PIX antes de reservar estoque ou criar o pedido.
    const pixSettings = paymentMethod === "pix" ? pixConfig() : null;
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (paymentMethod === "mercadopago" && !accessToken) {
      const error = new Error("O pagamento por cartão ainda não está disponível. Escolha PIX ou tente novamente mais tarde.");
      error.statusCode = 503; throw error;
    }
    const required = { name: "nome", email: "e-mail", phone: "telefone", address: "endereço", address_number: "número", city: "cidade", state: "estado", postal_code: "CEP" };
    for (const [field, label] of Object.entries(required)) {
      if (!String(customer[field] || "").trim()) return res.status(400).json({ detail: `Preencha o campo obrigatório: ${label}.` });
    }
    const buyerEmail = String(customer.email).trim().toLowerCase();
    if (!validEmail(buyerEmail)) return res.status(400).json({ detail: "Informe um e-mail válido." });
    const uf = S.normalizeUf(customer.state);
    if (!uf) return res.status(400).json({ detail: "Informe o estado com a sigla (UF), por exemplo SP." });
    if (String(customer.postal_code).replace(/\D/g, "").length !== 8) return res.status(400).json({ detail: "Informe um CEP válido com 8 números." });
    const phoneDigits = String(customer.phone).replace(/\D/g, "").length;
    if (phoneDigits < 10 || phoneDigits > 13) return res.status(400).json({ detail: "Informe um telefone válido com DDD." });
    if (body.privacy_consent !== true) return res.status(400).json({ detail: "É necessário confirmar a leitura da Política de Privacidade para concluir o pedido." });

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length < 1 || rawItems.length > 20) return res.status(400).json({ detail: "Sua sacola está vazia ou tem itens demais." });
    const items = rawItems.map((raw) => ({
      product_id: Number(raw && raw.product_id), quantity: Number(raw && raw.quantity),
      size: String((raw && raw.size) || "").trim().slice(0, 20),
      color: String((raw && raw.color) || "").trim().slice(0, 30)
    }));
    for (const it of items) {
      if (!Number.isSafeInteger(it.product_id) || it.product_id < 1 || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 10) {
        return res.status(400).json({ detail: "Produto ou quantidade inválidos na sacola." });
      }
    }

    const supabase = getSupabase();
    // Frete calculado aqui (estado + peso + regras de frete grátis). O navegador nunca informa o valor.
    const { configured, settings } = await S.readSettings(supabase);
    if (!configured) return res.status(503).json({ detail: "A loja ainda não configurou o frete. Tente novamente em breve." });
    const store = await readStoreSettings(supabase);
    const lines = await S.priceLines(supabase, items);
    // Peça com lançamento agendado ainda não pode ser comprada.
    try {
      const { data: sched } = await supabase.from("products").select("id,publish_at").in("id", [...new Set(items.map((i) => i.product_id))]);
      if ((sched || []).some((p) => p.publish_at && new Date(p.publish_at) > new Date())) return res.status(409).json({ detail: "Uma das peças ainda não está disponível. Atualize a sacola." });
    } catch (_) { /* banco sem a coluna: segue */ }
    const quote = S.computeQuote(settings, uf, lines);

    const { error: expireError } = await supabase.rpc("expire_krypto_orders");
    if (expireError) throw expireError;
    // Sem login, limita pedidos em aberto por e-mail para ninguém travar o estoque da loja.
    const { count: openOrders, error: openError } = await supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("email", buyerEmail).eq("status", "aguardando_pagamento").eq("payment_status", "pending");
    if (openError) throw openError;
    if ((openOrders || 0) >= 3) return res.status(429).json({ detail: "Você já tem 3 pedidos aguardando pagamento. Pague ou aguarde expirarem para fazer outro." });
    // Desconto PIX definido no painel; o banco calcula o valor (o navegador nunca informa desconto).
    const pixPercent = paymentMethod === "pix" ? Number(store.pix_discount_percent || 0) : 0;
    // Cupom (opcional): soma ao desconto do PIX. O banco limita o total a 50% do valor das peças.
    let couponPercent = 0, couponCode = "";
    if (String(body.coupon || "").trim()) {
      const coupon = findCoupon(store, body.coupon);
      if (!coupon) return res.status(400).json({ detail: "Esse cupom não é válido ou expirou. Remova-o ou confira o código." });
      couponPercent = coupon.percent;
      couponCode = coupon.code;
      if (coupon.first_order) {
        const { count: prior, error: priorError } = await supabase.from("orders").select("id", { count: "exact", head: true }).ilike("email", buyerEmail).not("status", "in", "(cancelado,expirado)");
        if (priorError) throw priorError;
        if ((prior || 0) > 0) return res.status(400).json({ detail: "Esse cupom vale só na primeira compra." });
      }
    }
    const pixDiscountPercent = Math.min(50, pixPercent + couponPercent);
    const { data, error } = await supabase.rpc("create_krypto_order_v2", {
      p_customer: {
        name: String(customer.name).trim().slice(0, 160), email: buyerEmail,
        phone: String(customer.phone).trim().slice(0, 40), address: String(customer.address).trim().slice(0, 200),
        address_number: String(customer.address_number).trim().slice(0, 30), complement: String(customer.complement || "").trim().slice(0, 120),
        city: String(customer.city).trim().slice(0, 100), state: uf,
        postal_code: String(customer.postal_code).replace(/\D/g, "").slice(0, 8)
      },
      p_items: items,
      p_shipping_cents: quote.shipping_cents,
      p_privacy_acknowledged: true,
      p_user_id: await Customer.currentCustomerId(supabase, req),
      ...(pixDiscountPercent > 0 ? { p_pix_discount_percent: pixDiscountPercent } : {})
    });
    if (error) {
      if (/OUT_OF_STOCK/.test(error.message || "")) return res.status(409).json({ detail: "Uma das peças não tem estoque suficiente para essa quantidade. Ajuste a sacola." });
      if (/PRODUCT_NOT_FOUND/.test(error.message || "")) return res.status(404).json({ detail: "Um produto da sacola não está mais disponível." });
      if (/INVALID_SIZE/.test(error.message || "")) return res.status(400).json({ detail: "Tamanho inválido para um dos produtos." });
      if (/INVALID_VARIANT/.test(error.message || "")) return res.status(400).json({ detail: "Essa combinação de cor e tamanho não está disponível. Atualize a sacola." });
      if (error.code === "PGRST202") return res.status(503).json({ detail: "A loja está sendo atualizada. Tente novamente em instantes." });
      if (/INVALID_COLOR/.test(error.message || "")) return res.status(400).json({ detail: "Cor inválida ou indisponível para um dos produtos. Atualize a sacola." });
      throw error;
    }
    const order = Array.isArray(data) ? data[0] : data;
    createdPublicId = order.public_id;
    // Registra o cupom e o frete escolhido (se o banco ainda não tem as colunas, o pedido segue normalmente).
    const extra = await supabase.from("orders").update({ coupon_code: couponCode, shipping_service: String(quote.name || "").slice(0, 80), shipping_days: quote.days || null }).eq("public_id", order.public_id);
    if (extra.error) console.error("[KRYPTO] Não foi possível gravar cupom/frete no pedido (migração 20261111 pendente?)", extra.error.message);
    // Se o banco ainda não recebeu a migração das cores, a cor escolhida se perderia no pedido: desfaz.
    if (items.some((it) => it.color) && !(order.order_items || []).every((line) => Object.prototype.hasOwnProperty.call(line, "color"))) {
      await supabase.rpc("cancel_krypto_order", { p_public_id: order.public_id, p_reason: "payment_setup_failed" });
      createdPublicId = null;
      return res.status(503).json({ detail: "As cores das peças estão sendo configuradas. Tente novamente em instantes." });
    }

    // Estoque baixo: avisa o administrador quando a peça comprada ficou com poucas unidades.
    await Push.withTimeout(lowStockAlert(supabase, req, store, order.order_items || []));

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
      // Avisa o administrador (notificação do sistema): há um PIX para conferir e confirmar.
      const qty = (order.order_items || []).reduce((n, l) => n + Number(l.quantity || 0), 0);
      await Push.withTimeout(Push.notifyAdmins(supabase, Push.subject(req), {
        title: `Novo pedido PIX · ${Push.money(order.total_cents)}`,
        body: `#${order.public_id} · ${qty} ${qty === 1 ? "peça" : "peças"} · aguardando você confirmar o pagamento`,
        url: "/admin.html#pedidos", tag: `pedido-${order.public_id}`
      }));
      const pix = pixSettings;
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({
        id: order.public_id, payment_method: "pix", subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents, discount_cents: order.discount_cents || 0, total_cents: order.total_cents,
        pix_key: pix.pix_key, pix_reserve_hours: pix.pix_reserve_hours,
        pix_payload: buildPixPayload({ key: pix.pix_key, amountCents: order.total_cents, merchantName: pix.merchant_name, merchantCity: pix.merchant_city, txid: order.public_id })
      });
    }

    const siteUrl = getSiteUrl(req);
    const prefResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          ...order.order_items.map((line) => ({
            id: String(line.product_id), title: `${line.name}${line.color ? ` - ${line.color}` : ""}${line.size ? ` (${line.size})` : ""}`.slice(0, 250),
            quantity: line.quantity, currency_id: "BRL", unit_price: line.unit_price_cents / 100
          })),
          ...(quote.shipping_cents > 0 ? [{ id: "shipping", title: quote.name, quantity: 1, currency_id: "BRL", unit_price: quote.shipping_cents / 100 }] : [])
        ],
        payer: { name: String(customer.name).trim().slice(0, 160), email: buyerEmail },
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
