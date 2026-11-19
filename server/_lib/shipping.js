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

// Frete "valor por km": cobra a distância de carro entre a loja e o cliente, só nas cidades listadas em rules.
function defaultKm() {
  return {
    enabled: true,
    name: "Entrega por km",
    origin: { street: "Rua José dos Anjos", number: "115", postal_code: "36091205", city: "Juiz de Fora", state: "MG" },
    rules: [{ city: "Juiz de Fora", state: "MG", per_km_cents: 100, min_cents: 0, days: 0 }]
  };
}
// Retirada na loja: sem frete, o cliente busca no endereço combinado.
function defaultPickup() {
  return { enabled: true, name: "Retirar na loja", note: "Rua José dos Anjos, 115 · Juiz de Fora/MG. Combinamos o horário pelo WhatsApp." };
}
const plain = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function defaultSettings() {
  const states = {};
  UFS.forEach((uf) => { states[uf] = { enabled: true, free: false, ...REGION_DEFAULTS[REGION_OF[uf]] }; });
  return {
    name: "Frete padrão",
    free_shipping: false,       // frete grátis para todos os pedidos
    free_over_cents: 0,         // frete grátis a partir deste subtotal (0 = desligado)
    base_weight_grams: 1000,    // peso coberto pelo valor base do estado
    packaging_grams: 100,       // peso da embalagem somado a cada pedido
    states,
    km: defaultKm(),
    pickup: defaultPickup()
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

function sanitizePickup(input) {
  if (!input || typeof input !== "object") throw bad("Retirada na loja inválida.");
  return {
    enabled: input.enabled !== false,
    name: String(input.name || "Retirar na loja").trim().slice(0, 60) || "Retirar na loja",
    note: String(input.note || "").trim().slice(0, 200)
  };
}

function sanitizeKm(input) {
  if (!input || typeof input !== "object") throw bad("Frete por km inválido.");
  const o = input.origin && typeof input.origin === "object" ? input.origin : {};
  const origin = {
    street: String(o.street || "").trim().slice(0, 120), number: String(o.number || "").trim().slice(0, 20),
    postal_code: String(o.postal_code || "").replace(/\D/g, "").slice(0, 8),
    city: String(o.city || "").trim().slice(0, 80), state: String(o.state || "").trim().toUpperCase()
  };
  if (!origin.street || origin.postal_code.length !== 8 || !origin.city || !UF_NAMES[origin.state]) throw bad("Frete por km: informe rua, CEP, cidade e UF do endereço de saída da loja.");
  const rules = (Array.isArray(input.rules) ? input.rules : []).slice(0, 30).map((r, i) => {
    const state = String((r && r.state) || "").trim().toUpperCase(), city = String((r && r.city) || "").trim().slice(0, 80);
    if (!city || !UF_NAMES[state]) throw bad(`Frete por km, cidade ${i + 1}: informe a cidade e a UF.`);
    return {
      city, state,
      per_km_cents: int(r.per_km_cents, `${city} — valor por km`, 0, 100000),
      min_cents: int(r.min_cents ?? 0, `${city} — valor mínimo`, 0, 1000000),
      days: int(r.days ?? 0, `${city} — prazo (dias)`, 0, 90)
    };
  });
  return { enabled: input.enabled !== false, name: String(input.name || "Entrega por km").trim().slice(0, 60) || "Entrega por km", origin, rules };
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
  out.km = input.km === undefined ? defaultKm() : sanitizeKm(input.km);
  out.pickup = input.pickup === undefined ? defaultPickup() : sanitizePickup(input.pickup);
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
  const k = stored.km && typeof stored.km === "object" ? stored.km : {};
  out.km = { ...base.km, ...k, origin: { ...base.km.origin, ...(k.origin || {}) }, rules: Array.isArray(k.rules) ? k.rules : base.km.rules };
  const p = stored.pickup && typeof stored.pickup === "object" ? stored.pickup : {};
  out.pickup = { ...base.pickup, ...p };
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
    option: "standard", state: uf, name: settings.name, subtotal_cents: subtotal, weight_grams: weight, extra_kg: extraKg,
    calculated_cents: calculated, shipping_cents: freeReason ? 0 : calculated, free_reason: freeReason,
    days: rule.days || 0
  };
}

const subtotalOf = (lines) => lines.reduce((n, l) => n + l.price_cents * l.quantity, 0);

// Regra do frete por km para a cidade do cliente (ou null se a cidade não é atendida por km).
function findKmRule(settings, city, state) {
  const km = settings.km;
  if (!km || !km.enabled) return null;
  const uf = normalizeUf(state);
  return (km.rules || []).find((r) => plain(r.city) === plain(city) && r.state === uf) || null;
}

// Conta pura (sem internet): distanceKm já vem medida. Dá pra testar sozinha.
function computeKmQuote(settings, rule, lines, distanceKm, approximate = false) {
  const km = Math.round(distanceKm * 10) / 10;
  const calculated = Math.max(rule.min_cents || 0, Math.round(km * rule.per_km_cents));
  const subtotal = subtotalOf(lines);
  let freeReason = null;
  if (settings.free_shipping) freeReason = "all";
  else if (settings.free_over_cents > 0 && subtotal >= settings.free_over_cents) freeReason = "threshold";
  return {
    option: "km", state: rule.state, city: rule.city, name: `${settings.km.name} (${rule.city})`, subtotal_cents: subtotal,
    distance_km: km, approximate, per_km_cents: rule.per_km_cents,
    calculated_cents: calculated, shipping_cents: freeReason ? 0 : calculated, free_reason: freeReason, days: rule.days || 0
  };
}

// Retirada na loja: sempre grátis. Retorna null se o administrador desligou.
function pickupQuote(settings, lines) {
  const p = settings.pickup;
  if (!p || !p.enabled) return null;
  return { option: "pickup", name: p.name, note: p.note || "", subtotal_cents: subtotalOf(lines), calculated_cents: 0, shipping_cents: 0, free_reason: "pickup", days: 0 };
}

// Mede a distância (internet) e monta a cotação por km. customer: { address, address_number, city, state, postal_code }
async function quoteKm(settings, customer, lines) {
  const rule = findKmRule(settings, customer.city, customer.state);
  if (!rule) throw Object.assign(new Error("O frete por km não está disponível para essa cidade."), { statusCode: 422 });
  const { drivingKm } = require("./distance");
  const dest = { street: String(customer.address || "").split(" - ")[0], number: customer.address_number, city: customer.city, state: normalizeUf(customer.state), postal_code: customer.postal_code };
  const { km, approximate } = await drivingKm(settings.km.origin, dest);
  return computeKmQuote(settings, rule, lines, km, approximate);
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
  normalizeUf, computeQuote, parseItemsParam, priceLines, defaultKm, sanitizeKm, findKmRule, computeKmQuote, quoteKm, defaultPickup, sanitizePickup, pickupQuote
};
