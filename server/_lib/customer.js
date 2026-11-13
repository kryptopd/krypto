// Contas de clientes próprias da KRYPTO (tabela public.customers): login com e-mail e senha sem depender do Supabase Auth.
// Senhas com scrypt (sal individual); sessão em cookie HttpOnly assinado (HMAC) com validade de 30 dias.
const crypto = require("node:crypto");

const COOKIE = "krypto_session";
const SESSION_SECONDS = 30 * 24 * 3600;
let cachedSecret = null;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}
function verifyPassword(password, stored) {
  try {
    const [kind, n, r, p, salt, hash] = String(stored).split("$");
    if (kind !== "scrypt") return false;
    const expected = Buffer.from(hash, "base64");
    const actual = crypto.scryptSync(String(password), Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) { return false; }
}

// Segredo de assinatura: CUSTOMER_AUTH_SECRET (se existir) ou um segredo gerado e guardado no banco (só o servidor lê).
async function secret(supabase) {
  if (process.env.CUSTOMER_AUTH_SECRET) return process.env.CUSTOMER_AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  const { data, error } = await supabase.from("store_settings").select("value").eq("key", "auth").maybeSingle();
  if (error) throw error;
  if (data && data.value && data.value.secret) return (cachedSecret = data.value.secret);
  const fresh = crypto.randomBytes(32).toString("hex");
  const { error: saveError } = await supabase.from("store_settings").upsert({ key: "auth", value: { secret: fresh }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (saveError) throw saveError;
  return (cachedSecret = fresh);
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");
async function signSession(supabase, customerId) {
  const payload = b64(JSON.stringify({ sub: customerId, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const sig = crypto.createHmac("sha256", await secret(supabase)).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
async function readSession(supabase, req) {
  const header = String(req.headers.cookie || "");
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(header);
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", await secret(supabase)).update(payload).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data && data.exp > Date.now() / 1000 && /^[0-9a-f-]{36}$/.test(String(data.sub)) ? data.sub : null;
  } catch (_) { return null; }
}
function setCookie(res, req, token, maxAge = SESSION_SECONDS) {
  const secure = !/^(localhost|127\.0\.0\.1)/.test(String(req.headers.host || "")) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}
const clearCookie = (res, req) => setCookie(res, req, "", 0);

// Id do cliente logado (ou null). Nunca lança erro: sem login a compra continua como visitante.
async function currentCustomerId(supabase, req) { try { return await readSession(supabase, req); } catch (_) { return null; } }

module.exports = { hashPassword, verifyPassword, signSession, readSession, setCookie, clearCookie, currentCustomerId };
