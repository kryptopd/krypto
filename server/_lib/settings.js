// Configurações gerais da loja (tabela store_settings, chave "store"): desconto PIX, contato e redes,
// dados da empresa, banner da home, cupons e códigos de análise.
const DEFAULTS = {
  pix_discount_percent: 0, ga_id: "", pixel_id: "",
  whatsapp: "", whatsapp_message: "Olá! Vim pelo site da KRYPTO e gostaria de ajuda.", instagram: "", email: "",
  legal_name: "", cnpj: "", address: "",
  banner: { enabled: false, title: "", text: "", cta_label: "", cta_url: "", image_url: "" },
  coupons: [],
  low_stock_threshold: 3,
  newsletter_enabled: false, welcome_coupon: "",
  google_verification: ""
};

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function validCnpj(digits) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const calc = (len) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += Number(digits[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

function sanitize(raw) {
  const b = raw && typeof raw === "object" ? raw : {};

  const pct = b.pix_discount_percent === "" || b.pix_discount_percent == null ? 0 : Number(String(b.pix_discount_percent).replace(",", "."));
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw fail("O desconto no PIX deve ficar entre 0% e 50%.");
  const ga = str(b.ga_id, 24).toUpperCase();
  if (ga && !/^G-[A-Z0-9]{4,20}$/.test(ga)) throw fail("O código do Google Analytics tem o formato G-XXXXXXXXXX.");
  const pixel = str(b.pixel_id, 20);
  if (pixel && !/^\d{8,20}$/.test(pixel)) throw fail("O ID do Pixel da Meta tem só números (de 8 a 20 dígitos).");

  // WhatsApp: só dígitos; sem o código do país (55), acrescenta.
  let whatsapp = str(b.whatsapp, 30).replace(/\D/g, "");
  if (whatsapp && (whatsapp.length === 10 || whatsapp.length === 11)) whatsapp = `55${whatsapp}`;
  if (whatsapp && !/^\d{12,15}$/.test(whatsapp)) throw fail("WhatsApp inválido. Informe o número com DDD, por exemplo (11) 91234-5678.");

  // Instagram: aceita @usuario, usuario ou o link do perfil.
  let instagram = str(b.instagram, 120);
  if (instagram) {
    const m = /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)?@?([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/.exec(instagram);
    if (!m) throw fail("Instagram inválido. Use @usuario ou o link do perfil.");
    instagram = `https://www.instagram.com/${m[1]}/`;
  }
  const email = str(b.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("E-mail de contato inválido.");

  let cnpj = str(b.cnpj, 30).replace(/\D/g, "");
  if (cnpj) {
    if (!validCnpj(cnpj)) throw fail("CNPJ inválido. Confira os 14 números.");
    cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  const bn = b.banner && typeof b.banner === "object" ? b.banner : {};
  const link = str(bn.cta_url, 300);
  if (link && !/^(https?:\/\/|\/|#)/i.test(link)) throw fail("O link do banner deve começar com https://, / ou #.");
  const image = str(bn.image_url, 1000);
  if (image && !/^https:\/\//i.test(image)) throw fail("A imagem do banner é inválida. Envie a foto de novo.");
  const banner = { enabled: bn.enabled === true || bn.enabled === "true", title: str(bn.title, 80), text: str(bn.text, 220), cta_label: str(bn.cta_label, 30), cta_url: link, image_url: image };
  if (banner.enabled && !banner.title) throw fail("Para ligar o banner, informe o título.");

  const list = Array.isArray(b.coupons) ? b.coupons : [];
  if (list.length > 20) throw fail("Use no máximo 20 cupons.");
  const seen = new Set();
  const coupons = list.map((c) => {
    const code = str(c && c.code, 20).toUpperCase().replace(/\s+/g, "");
    const percent = Number(String((c && c.percent) ?? "").replace(",", "."));
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw fail("Cupom inválido: use de 3 a 20 letras ou números, sem espaços ou acentos.");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 50) throw fail(`O cupom ${code} precisa de um desconto entre 1% e 50%.`);
    if (seen.has(code)) throw fail(`O cupom ${code} está repetido.`);
    seen.add(code);
    return { code, percent: Math.round(percent * 100) / 100, active: !(c && (c.active === false || c.active === "false")), first_order: Boolean(c && (c.first_order === true || c.first_order === "true")) };
  });

  const intIn = (v, label, min, max, def) => { const n = v === "" || v == null ? def : Number(v); if (!Number.isInteger(n) || n < min || n > max) throw fail(`${label}: informe um número inteiro de ${min} a ${max}.`); return n; };
  const welcome = str(b.welcome_coupon, 20).toUpperCase();
  if (welcome && !coupons.some((c) => c.code === welcome)) throw fail("O cupom de boas-vindas precisa ser um dos cupons cadastrados.");
  const gv = str(b.google_verification, 80);
  if (gv && !/^google[a-z0-9]{8,60}(\.html)?$/i.test(gv)) throw fail("O código do Search Console tem o formato google1234abcd5678.html.");

  return {
    pix_discount_percent: Math.round(pct * 100) / 100, ga_id: ga, pixel_id: pixel,
    whatsapp, whatsapp_message: str(b.whatsapp_message, 200) || DEFAULTS.whatsapp_message, instagram, email,
    legal_name: str(b.legal_name, 120), cnpj, address: str(b.address, 200), banner, coupons,
    low_stock_threshold: intIn(b.low_stock_threshold, "Estoque baixo", 0, 100, 3),
    newsletter_enabled: b.newsletter_enabled === true || b.newsletter_enabled === "true", welcome_coupon: welcome,
    google_verification: gv ? (/\.html$/i.test(gv) ? gv : `${gv}.html`) : ""
  };
}

// Nunca derruba a loja: se a tabela não existe ou falha, valem os padrões.
async function readStoreSettings(supabase) {
  try {
    const { data, error } = await supabase.from("store_settings").select("value").eq("key", "store").maybeSingle();
    if (error || !data) return { ...DEFAULTS, banner: { ...DEFAULTS.banner }, coupons: [] };
    return sanitize(data.value);
  } catch (_) { return { ...DEFAULTS, banner: { ...DEFAULTS.banner }, coupons: [] }; }
}

async function saveStoreSettings(supabase, settings) {
  const { error } = await supabase.from("store_settings")
    .upsert({ key: "store", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

// Parte pública (sem cupons nem nada interno).
function publicSettings(s) {
  return {
    pix_discount_percent: s.pix_discount_percent, ga_id: s.ga_id, pixel_id: s.pixel_id,
    whatsapp: s.whatsapp, whatsapp_message: s.whatsapp_message, instagram: s.instagram, email: s.email,
    legal_name: s.legal_name, cnpj: s.cnpj, address: s.address,
    banner: s.banner && s.banner.enabled ? s.banner : null,
    newsletter_enabled: s.newsletter_enabled,
    welcome: s.newsletter_enabled && s.welcome_coupon ? { percent: (s.coupons.find((c) => c.code === s.welcome_coupon && c.active) || {}).percent || 0 } : null
  };
}

function findCoupon(settings, code) {
  const c = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  return (settings.coupons || []).find((x) => x.active && x.code === c) || null;
}

module.exports = { DEFAULTS, sanitize, readStoreSettings, saveStoreSettings, publicSettings, findCoupon, validCnpj };
