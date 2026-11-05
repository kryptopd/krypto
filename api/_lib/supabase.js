const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const error = new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.");
    error.statusCode = 503;
    throw error;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function sendError(res, error) {
  console.error("[KRYPTO API]", error);
  const status = error.statusCode || 500;
  return res.status(status).json({
    detail: status === 500 ? "Erro interno. Confira os logs da função na Vercel." : error.message
  });
}

function requireMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    res.status(405).json({ detail: "Método não permitido." });
    return false;
  }
  return true;
}

async function requireAdmin(req, res) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ detail: "Faça login com sua conta do Supabase Auth." });
    return false;
  }

  const allowedEmails = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedEmails.length) {
    res.status(503).json({ detail: "Configure ADMIN_EMAILS na Vercel com o e-mail autorizado para administrar a loja." });
    return false;
  }

  try {
    // Valida o token com o Supabase Auth no servidor; nunca confia no e-mail enviado pelo navegador.
    const { data, error } = await getSupabase().auth.getUser(match[1]);
    if (error || !data?.user?.email) {
      res.status(401).json({ detail: "Sua sessão expirou ou é inválida. Entre novamente." });
      return false;
    }
    if (!data.user.email_confirmed_at) {
      res.status(403).json({ detail: "Confirme o e-mail da conta de administrador no Supabase antes de acessar o painel." });
      return false;
    }
    if (!allowedEmails.includes(data.user.email.toLowerCase())) {
      res.status(403).json({ detail: "Este usuário está autenticado, mas não tem permissão de administrador." });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[KRYPTO AUTH] Falha ao validar sessão", error);
    res.status(503).json({ detail: "Não foi possível validar o login no Supabase. Confira as configurações do servidor." });
    return false;
  }
}

// Cliente logado (Supabase Auth). Devolve o usuário ou false (já respondeu ao navegador).
async function requireUser(req, res) {
  const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ detail: "Entre na sua conta para finalizar a compra.", code: "LOGIN_REQUIRED" });
    return false;
  }
  try {
    const { data, error } = await getSupabase().auth.getUser(match[1]);
    if (error || !data?.user?.email) {
      res.status(401).json({ detail: "Sua sessão expirou. Entre novamente para finalizar a compra.", code: "LOGIN_REQUIRED" });
      return false;
    }
    if (!data.user.email_confirmed_at) {
      res.status(403).json({ detail: "Confirme seu e-mail (enviamos um link) antes de finalizar a compra." });
      return false;
    }
    return data.user;
  } catch (error) {
    sendError(res, error);
    return false;
  }
}

function getSiteUrl(req) {
  const configured = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  if (!host) {
    const error = new Error("Configure SITE_URL com o domínio HTTPS da loja.");
    error.statusCode = 503;
    throw error;
  }
  return `${proto}://${host}`.replace(/^http:\/\/[^/]+\.vercel\.app/i, `https://${host}`);
}
// Chave PIX (chave aleatória) que recebe os pagamentos. Pode ser trocada pela variável PIX_KEY na Vercel.
const DEFAULT_PIX_KEY = "4f5415bf-b519-4df0-a504-c9bc73de4699";
function pixConfig() {
  return {
    pix_key: String(process.env.PIX_KEY || DEFAULT_PIX_KEY).trim(),
    // Quanto tempo o estoque fica reservado para um pedido PIX aguardando pagamento (definido no SQL).
    pix_reserve_hours: 24
  };
}
function paymentMethods() {
  return { pix: true, mercadopago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN) };
}
module.exports = { getSupabase, sendError, requireMethod, requireAdmin, requireUser, getSiteUrl, pixConfig, paymentMethods };
