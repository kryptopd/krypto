const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');

// Avaliações só de quem recebeu o pedido (status "entregue"), uma por produto em cada pedido.
//   GET  /api/reviews[?product_id=ID]             -> avaliações aprovadas (públicas)
//   POST { action: "lookup", order_code, email }  -> confere o pedido e lista as peças que podem ser avaliadas
//   POST { order_code, email, product_id, rating, comment } -> envia a avaliação (vai para moderação)
const attempts = new Map();
const tooMany = (req) => {
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0], now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now); attempts.set(ip, list);
  if (attempts.size > 5000) attempts.clear();
  return list.length > 12;
};
const GENERIC = "Não encontramos um pedido com esse código e e-mail.";
const firstNameAndInitial = (full) => {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : (parts[0] || "Cliente");
};

async function findDeliveredOrder(db, code, email) {
  const publicId = String(code || "").trim().toUpperCase().replace(/^#/, "");
  const mail = String(email || "").trim().toLowerCase();
  if (!/^[A-F0-9]{8,16}$/.test(publicId) || !mail) return { error: { status: 400, detail: "Informe o código do pedido e o e-mail usado na compra." } };
  const { data, error } = await db.from("orders").select("id,public_id,email,customer_name,status,items").eq("public_id", publicId).maybeSingle();
  if (error) throw error;
  if (!data || String(data.email || "").trim().toLowerCase() !== mail) return { error: { status: 404, detail: GENERIC } };
  if (data.status !== "entregue") return { error: { status: 409, detail: "Você poderá avaliar assim que o pedido for entregue. Obrigado pela paciência!" } };
  return { order: data };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;
  try {
    const db = getSupabase();
    if (req.method === "GET") {
      const productId = Number(req.query.product_id);
      const base = "id,customer_name,product_name,rating,comment,created_at";
      let q = db.from("reviews").select(`${base},product_id`).eq("status", "approved").order("created_at", { ascending: false }).limit(30);
      if (Number.isSafeInteger(productId) && productId > 0) q = q.eq("product_id", productId);
      let { data, error } = await q;
      // Banco sem a migração das avaliações verificadas: lista tudo como antes.
      if (error && ["42703", "PGRST204"].includes(error.code)) {
        ({ data, error } = await db.from("reviews").select(base).eq("status", "approved").order("created_at", { ascending: false }).limit(30));
      }
      if (error) throw error;
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
      return res.status(200).json(data || []);
    }

    const b = req.body || {};
    if (String(b.website || "").trim()) return res.status(400).json({ detail: "Envio inválido." });
    if (tooMany(req)) return res.status(429).json({ detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    const found = await findDeliveredOrder(db, b.order_code, b.email);
    if (found.error) return res.status(found.error.status).json({ detail: found.error.detail });
    const order = found.order;
    const items = [...new Map((Array.isArray(order.items) ? order.items : []).filter((i) => i && i.product_id).map((i) => [Number(i.product_id), i.name])).entries()]
      .map(([product_id, name]) => ({ product_id, name }));

    if (b.action === "lookup") {
      const { data: done, error } = await db.from("reviews").select("product_id").eq("order_id", order.id);
      if (error && !["42703", "PGRST204"].includes(error.code)) throw error;
      const reviewed = new Set((done || []).map((r) => Number(r.product_id)));
      return res.status(200).json({ customer: firstNameAndInitial(order.customer_name), items: items.map((i) => ({ ...i, reviewed: reviewed.has(i.product_id) })) });
    }

    const productId = Number(b.product_id), rating = Number(b.rating), comment = String(b.comment || "").trim();
    const item = items.find((i) => i.product_id === productId);
    if (!item) return res.status(400).json({ detail: "Escolha uma das peças deste pedido." });
    if (comment.length < 10 || comment.length > 1200 || !Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ detail: "Informe uma nota de 1 a 5 estrelas e um comentário entre 10 e 1.200 caracteres." });
    const links = (comment.match(/https?:\/\//gi) || []).length;
    const repeated = (comment.match(/(.)\1{7,}/g) || []).length;
    const promo = /(ganhe dinheiro|renda extra|clique aqui|pix garantido|compre seguidores)/i.test(comment);
    const { error } = await db.from("reviews").insert({
      customer_name: firstNameAndInitial(order.customer_name), email: String(order.email).trim().toLowerCase(),
      product_name: String(item.name).slice(0, 140), rating, comment, status: "pending",
      spam_flag: links > 1 || repeated || promo ? "Revisar possível spam" : null,
      order_id: order.id, product_id: productId
    });
    if (error) {
      if (error.code === "23505") return res.status(409).json({ detail: "Você já avaliou esta peça neste pedido. Obrigado!" });
      if (["42703", "PGRST204"].includes(error.code)) return res.status(503).json({ detail: "As avaliações estão sendo atualizadas. Tente novamente em breve." });
      throw error;
    }
    return res.status(201).json({ message: "Avaliação recebida e enviada para moderação." });
  } catch (e) { return sendError(res, e); }
};
