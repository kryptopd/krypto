// Distância entre a loja e o endereço do cliente, para o frete "valor por km".
// Usa serviços abertos, sem chave: Nominatim (OpenStreetMap) para achar o ponto no mapa e OSRM para a
// distância de carro. Se a rota falhar, usa a distância em linha reta x 1,3 (aproximação de ruas).
// Opcional: KRYPTO_ORIGIN_LAT e KRYPTO_ORIGIN_LNG na Vercel fixam o ponto de saída da loja (pula a busca).

const UA = "KryptoLoja/1.0 (frete por km)";
const cache = new Map();           // endereço -> { lat, lon } (vale enquanto a função estiver "quente")
const TIMEOUT_MS = 6000;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function cepFmt(cep) { const d = String(cep || "").replace(/\D/g, ""); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; }

async function nominatim(params) {
  const qs = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "br", ...params });
  const data = await getJson(`https://nominatim.openstreetmap.org/search?${qs}`);
  const hit = Array.isArray(data) ? data[0] : null;
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

// addr: { street, number, city, state, postal_code }. Tenta do mais preciso ao menos preciso.
async function geocode(addr) {
  const key = JSON.stringify([addr.street, addr.number, addr.city, addr.state, String(addr.postal_code || "").replace(/\D/g, "")]).toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const city = addr.city || "", state = addr.state || "";
  const tries = [];
  if (addr.street && addr.number) tries.push({ street: `${addr.number} ${addr.street}`, city, state, country: "Brasil" });
  if (addr.street) tries.push({ street: addr.street, city, state, country: "Brasil" });
  if (addr.postal_code) tries.push({ postalcode: cepFmt(addr.postal_code), country: "Brasil" });
  if (addr.street) tries.push({ q: `${addr.street}, ${city}, ${state}, Brasil` });
  let found = null;
  for (let i = 0; i < tries.length && !found; i++) {
    try { found = await nominatim(tries[i]); } catch (_) { /* tenta a próxima */ }
    if (!found && i < tries.length - 1) await new Promise((r) => setTimeout(r, 1100)); // regra do Nominatim: 1 busca por segundo
  }
  if (found) cache.set(key, found);
  return found;
}

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180, R = 6371;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function originPoint(origin) {
  const lat = Number(process.env.KRYPTO_ORIGIN_LAT), lon = Number(process.env.KRYPTO_ORIGIN_LNG);
  if (Number.isFinite(lat) && Number.isFinite(lon) && process.env.KRYPTO_ORIGIN_LAT) return { lat, lon };
  return geocode(origin);
}

// Retorna { km, approximate } ou lança erro 422 se o endereço não foi localizado.
async function drivingKm(origin, destination) {
  const from = await originPoint(origin);
  if (!from) throw Object.assign(new Error("Não conseguimos calcular o frete por km agora. Use a outra opção de frete."), { statusCode: 503 });
  const to = await geocode(destination);
  if (!to) throw Object.assign(new Error("Não conseguimos localizar esse endereço no mapa para calcular por km. Confira rua, número e CEP, ou use a outra opção de frete."), { statusCode: 422 });
  try {
    const data = await getJson(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`);
    const meters = data && data.routes && data.routes[0] && data.routes[0].distance;
    if (Number.isFinite(meters) && meters >= 0) return { km: meters / 1000, approximate: false };
  } catch (_) { /* cai na estimativa */ }
  return { km: haversineKm(from, to) * 1.3, approximate: true };
}

module.exports = { drivingKm, geocode, haversineKm };
