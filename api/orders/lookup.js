const { getSupabase, sendError, requireMethod } = require("../_lib/supabase");
const single = require("./[id]");

// Painel "Meus pedidos" sem conta:
//  - { ids: [...] }            -> status dos pedidos que o navegador já guarda (máx. 20)
//  - { email, phone }          -> recupera TODOS os pedidos desse e-mail + telefone em outro aparelho
//  - { email, code }           -> (alternativa) recupera um pedido pelo código
const attempts = new Map(); // limite simples por IP (vale por instância da função; reduz tentativas em massa)
function tooMany(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const now = Date.now(), recent = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now); attempts.set(ip, recent);
  if (attempts.size > 5000) attempts.clear();
  return recent.length > 10;
}
// Normaliza telefone brasileiro: DDD + últimos 8 dígitos (ignora +55, zero à esquerda e o 9º dígito).
function phoneKey(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : "";
}
const NOT_FOUND = "Não encontramos pedidos com esse e-mail e telefone. Use os mesmos dados informados na compra.";

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const body = req.body || {};
    const supabase = getSupabase();
    const columns = `${single.BASE_COLUMNS},payment_method`;
    let rows = [];
    if (Array.isArray(body.ids)) {
      const ids = [...new Set(body.ids.map((v) => String(v || "").trim().toUpperCase()).filter((v) => /^[A-F0-9]{8,16}$/.test(v)))].slice(0, 20);
      if (ids.length) {
        const { data, error } = await supabase.from("orders").select(columns).in("public_id", ids);
        if (error) throw error;
        rows = data || [];
      }
    } else if (body.phone !== undefined) {
      const email = String(body.email || "").trim().toLowerCase(), key = phoneKey(body.phone);
      if (!email || !key) return res.status(400).json({ detail: "Informe o e-mail e o telefone (com DDD) usados na compra." });
      if (tooMany(req)) return res.status(429).json({ detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
      const { data, error } = await supabase.from("orders").select(`${columns},phone`).eq("email", email).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      // Mesma resposta para "e-mail inexistente" e "telefone diferente": não revela quais e-mails compraram.
      rows = (data || []).filter((r) => phoneKey(r.phone) === key);
      if (!rows.length) return res.status(404).json({ detail: NOT_FOUND });
    } else {
      if (tooMany(req)) return res.status(429).json({ detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
      const code = String(body.code || "").trim().toUpperCase().replace(/^#/, "");
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[A-F0-9]{8,16}$/.test(code) || !email) return res.status(400).json({ detail: "Informe o e-mail e o código do pedido." });
      const { data, error } = await supabase.from("orders").select(`${columns},email`).eq("public_id", code).maybeSingle();
      if (error) throw error;
      // Mesma resposta para "não existe" e "e-mail diferente": não revela quais pedidos existem.
      if (!data || String(data.email || "").trim().toLowerCase() !== email) return res.status(404).json({ detail: "Não encontramos um pedido com esse e-mail e código." });
      rows = [data];
    }
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ orders: rows.map(single.publicOrder) });
  } catch (error) { return sendError(res, error); }
};
