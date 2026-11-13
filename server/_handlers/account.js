const { getSupabase, sendError, requireMethod } = require('../_lib/supabase');
const C = require('../_lib/customer');
const { publicOrder } = require('./orders/[id]');

// Conta do cliente. Rotas (api/index.js): account/register | login | logout | me | orders | favorites | claim
const attempts = new Map();
const tooMany = (req, key, max = 10) => {
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0], now = Date.now(), id = `${key}:${ip}`;
  const list = (attempts.get(id) || []).filter((t) => now - t < 15 * 60 * 1000);
  list.push(now); attempts.set(id, list);
  if (attempts.size > 5000) attempts.clear();
  return list.length > max;
};
const fail = (status, detail) => Object.assign(new Error(detail), { statusCode: status });
const validEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const publicCustomer = (c) => ({ id: c.id, email: c.email, name: c.name, phone: c.phone, address: c.address || {}, favorites: Array.isArray(c.favorites) ? c.favorites : [] });

function cleanAddress(a) {
  if (!a || typeof a !== "object") return {};
  const f = (k, n) => String(a[k] || "").trim().slice(0, n);
  const out = { name: f("name", 160), phone: f("phone", 40), postal_code: f("postal_code", 12).replace(/\D/g, ""), address: f("address", 200), address_number: f("address_number", 30), complement: f("complement", 120), city: f("city", 100), state: f("state", 2).toUpperCase() };
  return out;
}

module.exports = async function handler(req, res) {
  const action = String(req.query.action || "");
  try {
    res.setHeader("Cache-Control", "no-store");
    const db = getSupabase(), body = req.body || {};

    if (action === "register") {
      if (!requireMethod(req, res, ["POST"])) return;
      if (String(body.website || "").trim()) throw fail(400, "Requisição inválida.");
      if (tooMany(req, "reg", 8)) throw fail(429, "Muitas tentativas. Aguarde alguns minutos.");
      const email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
      if (!validEmail(email)) throw fail(400, "Informe um e-mail válido.");
      if (password.length < 8 || password.length > 100) throw fail(400, "A senha precisa ter de 8 a 100 caracteres.");
      if (body.privacy_consent !== true) throw fail(400, "Confirme a leitura da Política de Privacidade para criar a conta.");
      const row = { email, password_hash: C.hashPassword(password), name: String(body.name || "").trim().slice(0, 160), phone: String(body.phone || "").trim().slice(0, 40) };
      const { data, error } = await db.from("customers").insert(row).select("*").single();
      if (error) {
        if (error.code === "23505") throw fail(409, "Já existe uma conta com esse e-mail. Entre com sua senha.");
        if (error.code === "42P01") throw fail(503, "As contas de clientes estão sendo configuradas. Tente novamente em breve.");
        throw error;
      }
      C.setCookie(res, req, await C.signSession(db, data.id));
      return res.status(201).json(publicCustomer(data));
    }

    if (action === "login") {
      if (!requireMethod(req, res, ["POST"])) return;
      if (tooMany(req, "login", 15)) throw fail(429, "Muitas tentativas. Aguarde alguns minutos.");
      const email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
      const generic = fail(401, "E-mail ou senha incorretos.");
      if (!validEmail(email) || !password) throw generic;
      const { data: c, error } = await db.from("customers").select("*").ilike("email", email).maybeSingle();
      if (error) { if (error.code === "42P01") throw fail(503, "As contas de clientes estão sendo configuradas. Tente novamente em breve."); throw error; }
      if (!c) { C.verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"); throw generic; }   // tempo parecido
      if (c.locked_until && new Date(c.locked_until) > new Date()) throw fail(423, "Conta bloqueada por tentativas erradas. Tente de novo em 15 minutos ou fale com o atendimento.");
      if (!C.verifyPassword(password, c.password_hash)) {
        const failed = (c.failed_logins || 0) + 1;
        await db.from("customers").update(failed >= 5 ? { failed_logins: 0, locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString() } : { failed_logins: failed }).eq("id", c.id);
        throw generic;
      }
      await db.from("customers").update({ failed_logins: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", c.id);
      C.setCookie(res, req, await C.signSession(db, c.id));
      return res.status(200).json(publicCustomer(c));
    }

    if (action === "logout") {
      if (!requireMethod(req, res, ["POST"])) return;
      C.clearCookie(res, req);
      return res.status(200).json({ ok: true });
    }

    // As demais rotas exigem login.
    const id = await C.readSession(db, req);
    if (!id) throw fail(401, "Entre na sua conta para continuar.");
    const { data: me, error: meError } = await db.from("customers").select("*").eq("id", id).maybeSingle();
    if (meError) throw meError;
    if (!me) { C.clearCookie(res, req); throw fail(401, "Sessão expirada. Entre novamente."); }

    if (action === "me") {
      if (!requireMethod(req, res, ["GET", "PUT"])) return;
      if (req.method === "GET") return res.status(200).json(publicCustomer(me));
      const patch = {};
      if (body.name !== undefined) patch.name = String(body.name || "").trim().slice(0, 160);
      if (body.phone !== undefined) patch.phone = String(body.phone || "").trim().slice(0, 40);
      if (body.address !== undefined) patch.address = cleanAddress(body.address);
      if (body.new_password) {
        if (!C.verifyPassword(String(body.current_password || ""), me.password_hash)) throw fail(403, "A senha atual está incorreta.");
        const np = String(body.new_password);
        if (np.length < 8 || np.length > 100) throw fail(400, "A nova senha precisa ter de 8 a 100 caracteres.");
        patch.password_hash = C.hashPassword(np);
      }
      const { data, error } = await db.from("customers").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return res.status(200).json(publicCustomer(data));
    }

    if (action === "favorites") {
      if (!requireMethod(req, res, ["PUT"])) return;
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 200);
      const { error } = await db.from("customers").update({ favorites: ids }).eq("id", id);
      if (error) throw error;
      return res.status(200).json({ favorites: ids });
    }

    if (action === "orders") {
      if (!requireMethod(req, res, ["GET"])) return;
      const cols = "id,public_id,status,payment_status,subtotal_cents,shipping_cents,total_cents,created_at,tracking_code,shipping_provider,items,payment_method,discount_cents";
      const { data, error } = await db.from("orders").select(cols).eq("user_id", id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return res.status(200).json({ orders: (data || []).map(publicOrder) });
    }

    // Vincula à conta um pedido feito antes como visitante (precisa do código e do e-mail usados na compra).
    if (action === "claim") {
      if (!requireMethod(req, res, ["POST"])) return;
      if (tooMany(req, "claim", 10)) throw fail(429, "Muitas tentativas. Aguarde alguns minutos.");
      const code = String(body.code || "").trim().toUpperCase().replace(/^#/, ""), email = String(body.email || "").trim().toLowerCase();
      const { data: o, error } = await db.from("orders").select("id,email,user_id").eq("public_id", code).maybeSingle();
      if (error) throw error;
      if (!o || String(o.email || "").trim().toLowerCase() !== email) throw fail(404, "Não encontramos um pedido com esse código e e-mail.");
      if (o.user_id && o.user_id !== id) throw fail(409, "Esse pedido já está ligado a outra conta.");
      const { error: upError } = await db.from("orders").update({ user_id: id }).eq("id", o.id);
      if (upError) throw upError;
      return res.status(200).json({ ok: true });
    }

    throw fail(404, "Rota não encontrada.");
  } catch (error) { return sendError(res, error); }
};
