const { getSupabase, sendError, requireMethod } = require("../_lib/supabase");
const single = require("./[id]");

// Painel "Meus pedidos" sem conta:
//  - { ids: [...] }            -> status dos pedidos que o navegador já guarda (máx. 20)
//  - { email, code }           -> recupera um pedido em outro aparelho (e-mail do pedido + código)
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
    } else {
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
