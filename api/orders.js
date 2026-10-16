const { getSupabase, sendError, requireMethod } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const body = req.body || {};
    const customer = body.customer || {};
    const item = body.item || {};
    const required = ["name", "email", "phone", "address", "address_number", "city", "state", "postal_code"];
    for (const field of required) {
      if (!String(customer[field] || "").trim()) {
        return res.status(400).json({ detail: `Preencha o campo obrigatório: ${field}.` });
      }
    }
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ detail: "Produto ou quantidade inválidos." });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("create_krypto_order", {
      p_customer: {
        name: String(customer.name).trim().slice(0, 160),
        email: String(customer.email).trim().slice(0, 254),
        phone: String(customer.phone).trim().slice(0, 40),
        address: String(customer.address).trim().slice(0, 200),
        address_number: String(customer.address_number).trim().slice(0, 30),
        complement: String(customer.complement || "").trim().slice(0, 120),
        city: String(customer.city).trim().slice(0, 100),
        state: String(customer.state).trim().slice(0, 60),
        postal_code: String(customer.postal_code).trim().slice(0, 20)
      },
      p_item: {
        product_id: productId,
        quantity,
        size: String(item.size || "").trim().slice(0, 20)
      }
    });
    if (error) {
      if (error.message && /OUT_OF_STOCK/.test(error.message)) {
        return res.status(409).json({ detail: "Estoque insuficiente para essa quantidade." });
      }
      if (error.message && /PRODUCT_NOT_FOUND/.test(error.message)) {
        return res.status(404).json({ detail: "Produto não encontrado ou indisponível." });
      }
      if (error.message && /INVALID_SIZE/.test(error.message)) {
        return res.status(400).json({ detail: "Tamanho inválido para esse produto." });
      }
      throw error;
    }
    const order = Array.isArray(data) ? data[0] : data;
    return res.status(201).json({ id: order.public_id, total_cents: order.total_cents });
  } catch (error) {
    return sendError(res, error);
  }
};