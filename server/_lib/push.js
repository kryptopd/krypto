// Notificações do sistema (Web Push) para o administrador, por exemplo quando entra um pedido novo.
// As chaves VAPID são geradas na primeira vez e ficam na tabela store_settings (chave "push"), que só o servidor lê.
// Carrega a biblioteca só quando precisa: se ela faltar, a loja continua funcionando (só sem notificações).
let webpushLib = null;
const wp = () => webpushLib || (webpushLib = require("web-push"));

const KEY = "push";
const MAX_DEVICES = 10;

async function readState(supabase) {
  const { data, error } = await supabase.from("store_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw error;
  const v = (data && data.value) || {};
  return { vapid: v.vapid || null, subs: Array.isArray(v.subs) ? v.subs : [] };
}
async function writeState(supabase, state) {
  const { error } = await supabase.from("store_settings").upsert({ key: KEY, value: state, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}
async function ensureState(supabase) {
  const state = await readState(supabase);
  if (!state.vapid) { state.vapid = wp().generateVAPIDKeys(); await writeState(supabase, state); }
  return state;
}

function validSubscription(sub) {
  return Boolean(sub) && typeof sub.endpoint === "string" && /^https:\/\//i.test(sub.endpoint) && sub.endpoint.length < 1000
    && sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string";
}

async function addDevice(supabase, subscription, label) {
  if (!validSubscription(subscription)) throw Object.assign(new Error("Assinatura de notificação inválida."), { statusCode: 400 });
  const state = await ensureState(supabase);
  const entry = { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, label: String(label || "Aparelho").slice(0, 60), created_at: new Date().toISOString() };
  state.subs = [entry, ...state.subs.filter((s) => s.endpoint !== entry.endpoint)].slice(0, MAX_DEVICES);
  await writeState(supabase, state);
  return state.subs.length;
}
async function removeDevice(supabase, endpoint) {
  const state = await ensureState(supabase);
  state.subs = state.subs.filter((s) => s.endpoint !== endpoint);
  await writeState(supabase, state);
  return state.subs.length;
}

// Envia para todos os aparelhos cadastrados. Nunca lança erro: um aviso que falha não pode atrapalhar a compra.
async function notifyAdmins(supabase, subject, payload) {
  try {
    const state = await readState(supabase);
    if (!state.vapid || !state.subs.length) return { sent: 0 };
    const webpush = wp();
    webpush.setVapidDetails(subject, state.vapid.publicKey, state.vapid.privateKey);
    const body = JSON.stringify(payload);
    const dead = new Set();
    let sent = 0;
    await Promise.all(state.subs.map(async (sub) => {
      try { await webpush.sendNotification(sub, body, { TTL: 3600, urgency: "high", topic: payload.tag ? String(payload.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined }); sent += 1; }
      catch (error) { if (error && (error.statusCode === 404 || error.statusCode === 410)) dead.add(sub.endpoint); else console.error("[KRYPTO] Falha ao enviar notificação", error && (error.statusCode || error.message)); }
    }));
    if (dead.size) { state.subs = state.subs.filter((s) => !dead.has(s.endpoint)); await writeState(supabase, state); }
    return { sent };
  } catch (error) {
    console.error("[KRYPTO] Notificações indisponíveis", error && error.message);
    return { sent: 0 };
  }
}

// Espera no máximo `ms` para não segurar a resposta da compra.
const withTimeout = (promise, ms = 4000) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ sent: 0, timeout: true }), ms))]);

const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);

// Identificação exigida pelo protocolo: o endereço da loja, ou um e-mail se não houver endereço.
function subject(req) {
  try { return require("./supabase").getSiteUrl(req); } catch (_) { return "mailto:contato@krypto.com.br"; }
}

module.exports = { subject, ensureState, readState, addDevice, removeDevice, notifyAdmins, withTimeout, money };
