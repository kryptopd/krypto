const { getSupabase, sendError, requireMethod } = require("./_lib/supabase");
const recent = new Map();
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;
  try {
    const db = getSupabase();
    if (req.method === "GET") {
      const { data, error } = await db.from("reviews").select("id,customer_name,product_name,rating,comment,created_at").eq("status", "approved").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return res.status(200).json(data || []);
    }
    const b = req.body || {};
    if (String(b.website || "").trim()) return res.status(400).json({detail:"Envio inválido."});
    const email = String(b.email || "").trim().toLowerCase();
    const name = String(b.name || "").trim();
    const product = String(b.product_name || "").trim();
    const comment = String(b.comment || "").trim();
    const rating = Number(b.rating);
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return res.status(400).json({detail:"Confira seu nome e e-mail."});
    if (!product || product.length > 140 || comment.length < 10 || comment.length > 1200 || !Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({detail:"Informe o produto, uma avaliação de 1 a 5 estrelas e um comentário entre 10 e 1.200 caracteres."});
    const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0];
    const now = Date.now(), last = recent.get(ip) || 0;
    if (now - last < 30000) return res.status(429).json({detail:"Aguarde um pouco antes de enviar outra avaliação."});
    recent.set(ip, now);
    const links=(comment.match(/https?:\/\//gi)||[]).length;
    const repeated=(comment.match(/(.)\1{7,}/g)||[]).length;
    const promo=/(ganhe dinheiro|renda extra|clique aqui|pix garantido|compre seguidores)/i.test(comment);
    const spamFlag=links>1||repeated||promo?"Revisar possível spam":null;
    const { error } = await db.from("reviews").insert({ customer_name:name, email, product_name:product, rating, comment, status:"pending", spam_flag:spamFlag });
    if (error) throw error;
    return res.status(201).json({message:"Avaliação recebida e enviada para moderação."});
  } catch (e) { return sendError(res,e); }
};
