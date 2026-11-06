// Regras de frete da KRYPTO. Os valores ficam no banco (tabela store_settings, chave "shipping")
// e são editados no painel administrativo. Todo o cálculo é feito aqui, no servidor.

const UF_NAMES = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins"
};
const UFS = Object.keys(UF_NAMES);

// Valores sugeridos por região (ponto de partida; o administrador ajusta no painel).
const REGION_OF = {};
const REGIONS = { N: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"], NE: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"], CO: ["DF", "GO", "MT", "MS"], SE: ["ES", "MG", "RJ", "SP"], S: ["PR", "RS", "SC"] };
Object.entries(REGIONS).forEach(([region, list]) => list.forEach((uf) => { REGION_OF[uf] = region; }));
const REGION_DEFAULTS = {
  SE: { base_cents: 1990, per_kg_cents: 500, days: 5 },
  S: { base_cents: 2290, per_kg_cents: 600, days: 6 },
  CO: { base_cents: 2490, per_kg_cents: 700, days: 7 },
  NE: { base_cents: 2990, per_kg_cents: 800, days: 9 },
  N: { base_cents: 3490, per_kg_cents: 900, days: 12 }
};

function defaultSettings() {
  const states = {};
  UFS.forEach((uf) => { states[uf] = { enabled: true, free: false, ...REGION_DEFAULTS[REGION_OF[uf]] }; });
  return {
    name: "Frete padrão",
    free_shipping: false,       // frete grátis para todos os pedidos
    free_over_cents: 0,         // frete grátis a partir deste subtotal (0 = desligado)
    base_weight_grams: 1000,    // peso coberto pelo valor base do estado
    packaging_grams: 100,       // peso da embalagem somado a cada pedido
    states
  };
}

function bad(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
function int(value, label, min, max) {
  const n = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${label}: informe um número inteiro entre ${min} e ${max}.`);
  }
  return n;
}

// Valida o que vem do painel (rigoroso) e devolve o objeto no formato salvo.
function sanitizeSettings(input) {
  if (!input || typeof input !== "object") throw bad("Configurações de frete inválidas.");
  const out = {
    name: String(input.name || "Frete padrão").trim().slice(0, 60) || "Frete padrão",
    free_shipping: input.free_shipping === true,
    free_over_cents: int(input.free_over_cents ?? 0, "Frete grátis acima de", 0, 100000000),
    base_weight_grams: int(input.base_weight_grams, "Peso incluso no valor base (g)", 0, 100000),
    packaging_grams: int(input.packaging_grams ?? 0, "Peso da embalagem (g)", 0, 100000),
    states: {}
  };
  const given = input.states && typeof input.states === "object" ? input.states : {};
  for (const uf of UFS) {
    const s = given[uf];
    if (!s || typeof s !== "object") throw bad(`Faltam as regras do estado ${uf}.`);
    out.states[uf] = {
      enabled: s.enabled !== false,
      free: s.free === true,
      base_cents: int(s.base_cents, `${uf} — valor base`, 0, 1000000),
      per_kg_cents: int(s.per_kg_cents, `${uf} — valor por kg extra`, 0, 1000000),
      days: int(s.days ?? 0, `${uf} — prazo (dias)`, 0, 90)
    };
  }
  return out;
}

// Lê do banco e completa campos que faltem (versões antigas) com os padrões.
function normalizeSettings(stored) {
  const base = defaultSettings();
  if (!stored || typeof stored !== "object") return base;
  const out = { ...base, ...stored, states: { ...base.states } };
  for (const uf of UFS) out.states[uf] = { ...base.states[uf], ...((stored.states || {})[uf] || {}) };
  return out;
}

// Retorna { configured, settings }. configured=false enquanto o administrador não salvar o frete.
async function readSettings(supabase) {
  const { data, error } = await supabase.from("store_settings").select("value").eq("key", "shipping").maybeSingle();
  if (error) {
    if (error.code === "42P01" || /store_settings/.test(error.message || "")) {
      throw Object.assign(new Error("O banco ainda não tem a tabela de configurações. Execute supabase/migrations/20261106_shipping_cart_accounts.sql no Supabase."), { statusCode: 503 });
    }
    throw error;
  }
  if (!data) return { configured: false, settings: defaultSettings() };
  return { configured: true, settings: normalizeSettings(data.value) };
}

async function saveSettings(supabase, settings) {
  const { error } = await supabase.from("store_settings")
    .upsert({ key: "shipping", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

function normalizeUf(value) {
  const uf = String(value || "").trim().toUpperCase();
  return UF_NAMES[uf] ? uf : null;
}

// lines: [{ price_cents, weight_grams, quantity }]
function computeQuote(settings, state, lines) {
  const uf = normalizeUf(state);
  if (!uf) throw Object.assign(new Error("Informe um estado (UF) válido para calcular o frete."), { statusCode: 400 });
  const rule = settings.states[uf];
  if (!rule || !rule.enabled) {
    throw Object.assign(new Error(`Ainda não entregamos em ${UF_NAMES[uf]}.`), { statusCode: 422 });
  }
  let subtotal = 0, itemsWeight = 0;
  for (const line of lines) {
    subtotal += line.price_cents * line.quantity;
    itemsWeight += (line.weight_grams || 0) * line.quantity;
  }
  const weight = itemsWeight + settings.packaging_grams;
  const extraKg = weight > settings.base_weight_grams ? Math.ceil((weight - settings.base_weight_grams) / 1000) : 0;
  const calculated = rule.base_cents + extraKg * rule.per_kg_cents;
  let freeReason = null;
  if (settings.free_shipping) freeReason = "all";
  else if (rule.free) freeReason = "state";
  else if (settings.free_over_cents > 0 && subtotal >= settings.free_over_cents) freeReason = "threshold";
  return {
    state: uf, name: settings.name, subtotal_cents: subtotal, weight_grams: weight, extra_kg: extraKg,
    calculated_cents: calculated, shipping_cents: freeReason ? 0 : calculated, free_reason: freeReason,
    days: rule.days || 0
  };
}

// "12:2,15:1" -> [{ product_id: 12, quantity: 2 }, ...]
function parseItemsParam(raw) {
  const out = [];
  for (const part of String(raw || "").split(",").filter(Boolean).slice(0, 20)) {
    const [id, qty] = part.split(":").map(Number);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(qty) || qty < 1 || qty > 10) throw bad("Itens da sacola inválidos.");
    out.push({ product_id: id, quantity: qty });
  }
  return out;
}

// Junta as linhas pedidas com preço/peso atuais do banco.
async function priceLines(supabase, items) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const { data, error } = await supabase.from("products").select("id,name,price_cents,weight_grams,active").in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).filter((p) => p.active).map((p) => [p.id, p]));
  return items.map((item) => {
    const p = byId.get(item.product_id);
    if (!p) throw Object.assign(new Error("Um produto da sacola não está mais disponível. Atualize a sacola."), { statusCode: 404 });
    return { product_id: p.id, price_cents: p.price_cents, weight_grams: p.weight_grams ?? 0, quantity: item.quantity };
  });
}

module.exports = {
  UF_NAMES, UFS, REGION_OF, defaultSettings, sanitizeSettings, normalizeSettings, readSettings, saveSettings,
  normalizeUf, computeQuote, parseItemsParam, priceLines
};
