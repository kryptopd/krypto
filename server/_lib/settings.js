// Configurações gerais da loja (tabela store_settings, chave "store"): desconto PIX e códigos de análise.
const DEFAULTS = { pix_discount_percent: 0, ga_id: "", pixel_id: "" };

function sanitize(raw) {
  const body = raw && typeof raw === "object" ? raw : {};
  const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
  const pct = body.pix_discount_percent === "" || body.pix_discount_percent == null ? 0 : Number(String(body.pix_discount_percent).replace(",", "."));
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw fail("O desconto no PIX deve ficar entre 0% e 50%.");
  const ga = String(body.ga_id || "").trim().toUpperCase();
  if (ga && !/^G-[A-Z0-9]{4,20}$/.test(ga)) throw fail("O código do Google Analytics tem o formato G-XXXXXXXXXX.");
  const pixel = String(body.pixel_id || "").trim();
  if (pixel && !/^\d{8,20}$/.test(pixel)) throw fail("O ID do Pixel da Meta tem só números (de 8 a 20 dígitos).");
  return { pix_discount_percent: Math.round(pct * 100) / 100, ga_id: ga, pixel_id: pixel };
}

// Nunca derruba a loja: se a tabela não existe ou falha, vale o padrão (sem desconto, sem análise).
async function readStoreSettings(supabase) {
  try {
    const { data, error } = await supabase.from("store_settings").select("value").eq("key", "store").maybeSingle();
    if (error || !data) return { ...DEFAULTS };
    return { ...DEFAULTS, ...sanitize(data.value) };
  } catch (_) { return { ...DEFAULTS }; }
}

async function saveStoreSettings(supabase, settings) {
  const { error } = await supabase.from("store_settings")
    .upsert({ key: "store", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

module.exports = { DEFAULTS, sanitize, readStoreSettings, saveStoreSettings };
