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
function shippingConfig() {
  const raw = process.env.KRYPTO_SHIPPING_CENTS;
  if (raw === undefined || !/^\\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    const error = new Error("Configure KRYPTO_SHIPPING_CENTS na Vercel (frete fixo em centavos, ex.: 1990 para R$ 19,90).");
    error.statusCode = 503;
    throw error;
  }
  return { shipping_cents: Number(raw), shipping_name: process.env.KRYPTO_SHIPPING_NAME || "Frete padrão" };
}
module.exports = { getSupabase, sendError, requireMethod, requireAdmin, getSiteUrl, shippingConfig };
