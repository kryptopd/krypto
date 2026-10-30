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

function requireAdmin(req, res) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match || !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    // Não enviar WWW-Authenticate: Basic evita o popup nativo do navegador.
    // A API continua protegida e retorna erro JSON para o formulário tratar.
    res.status(401).json({ detail: "Credenciais administrativas inválidas." });
    return false;
  }

  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    decoded = "";
  }
  const separator = decoded.indexOf(":");
  const username = separator >= 0 ? decoded.slice(0, separator) : "";
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";

  // Comparação simples adequada para um protótipo privado; use Auth dedicado
  // e proteção contra tentativas repetidas antes de operar uma loja real.
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ detail: "Usuário ou senha incorretos." });
    return false;
  }
  return true;
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
