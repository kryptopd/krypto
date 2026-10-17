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
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const allowedEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

  if (!match || !url || !anonKey || !allowedEmail) {
    res.status(401).json({ detail: "Sessão inválida ou administrador não configurado." });
    return false;
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data?.user || String(data.user.email || "").trim().toLowerCase() !== allowedEmail) {
      res.status(401).json({ detail: "Esta conta não tem permissão para acessar o painel." });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ detail: "Não foi possível validar a sessão. Entre novamente." });
    return false;
  }
}

module.exports = { getSupabase, sendError, requireMethod, requireAdmin };
