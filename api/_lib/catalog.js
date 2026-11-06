// Regras compartilhadas de produtos, categorias e fotos (usado por api/admin/catalog.js).
const BUCKET = "product-images";
const SIZES = ["M", "G", "GG", "G1"];       // tamanhos que o admin pode escolher (nesta ordem)
const MAX_PHOTOS = 4;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;   // a página já reduz a foto; isto é só um teto de segurança

const fail = (status, message) => Object.assign(new Error(message), { statusCode: status });
const MIGRATION_HINT = "Execute a migração supabase/migrations/20261107_photos_sizes_categories.sql no SQL Editor do Supabase e tente de novo.";

// Erros do Postgres/PostgREST que significam "a migração ainda não foi executada".
function isMissingSchema(error) {
  return Boolean(error) && (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code) || /schema cache|does not exist/i.test(error.message || ""));
}

function cleanSizes(value) {
  const chosen = new Set((Array.isArray(value) ? value : []).map((s) => String(s).trim().toUpperCase()));
  return SIZES.filter((s) => chosen.has(s));
}

function cleanImages(value) {
  const list = Array.isArray(value) ? value : [];
  const urls = [...new Set(list.map((u) => String(u || "").trim()).filter(Boolean))];
  if (urls.length < 1) throw fail(400, "Adicione ao menos uma foto da peça.");
  if (urls.length > MAX_PHOTOS) throw fail(400, `Use no máximo ${MAX_PHOTOS} fotos por peça.`);
  for (const url of urls) {
    if (url.length > 1000 || !/^https?:\/\//i.test(url)) throw fail(400, "Uma das fotos é inválida. Envie a foto de novo.");
  }
  return urls;
}

// Valida e normaliza o corpo do cadastro/edição de produto.
async function normalizeProduct(supabase, body) {
  const name = String(body.name || "").trim();
  const price = Number(body.price), stock = Number(body.stock);
  if (!name) throw fail(400, "Informe o nome do produto.");
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) throw fail(400, "Preço ou estoque inválido.");
  const weight = body.weight_grams === undefined || body.weight_grams === "" ? 300 : Number(body.weight_grams);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100000) throw fail(400, "Informe o peso em gramas (número inteiro entre 0 e 100000).");
  const images = cleanImages(body.images);

  // Categoria é opcional, mas se vier precisa existir na lista criada no painel.
  const category = String(body.category || "").trim();
  if (category) {
    const { data, error } = await supabase.from("categories").select("name").eq("name", category).maybeSingle();
    if (error) throw isMissingSchema(error) ? fail(503, MIGRATION_HINT) : error;
    if (!data) throw fail(400, "Essa categoria não existe mais. Atualize a página e escolha outra.");
  }
  return {
    name: name.slice(0, 160), category, price_cents: Math.round(price * 100), stock, weight_grams: weight,
    sizes: cleanSizes(body.sizes), images, image_url: images[0],
    description: String(body.description || "").trim().slice(0, 2000), active: true
  };
}

// ---------- Fotos (Supabase Storage) ----------
function detectImage(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

async function uploadPhoto(supabase, dataUrl) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw fail(400, "Envie uma foto JPG, PNG ou WebP.");
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length > MAX_UPLOAD_BYTES) throw fail(413, "A foto ficou grande demais. Tente outra foto.");
  const kind = detectImage(buffer);   // confere o conteúdo real, não só o nome/tipo informado
  if (!kind) throw fail(400, "O arquivo não parece ser uma foto JPG, PNG ou WebP.");
  const path = `${new Date().toISOString().slice(0, 7)}/${Date.now().toString(36)}-${require("crypto").randomBytes(6).toString("hex")}.${kind.ext}`;
  const send = () => supabase.storage.from(BUCKET).upload(path, buffer, { contentType: kind.type, cacheControl: "31536000", upsert: false });
  let { error } = await send();
  if (error && /bucket.*not.*found|not found/i.test(error.message || "")) {
    // Primeiro envio: cria a pasta pública sozinha.
    const created = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_UPLOAD_BYTES, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
    if (created.error && !/already exists/i.test(created.error.message || "")) throw created.error;
    ({ error } = await send());
  }
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Caminho dentro da nossa pasta (ou null se a URL é externa/antiga).
function storagePathFromUrl(url) {
  const m = /\/storage\/v1\/object\/public\/product-images\/(.+?)(?:\?.*)?$/.exec(String(url || ""));
  return m ? decodeURIComponent(m[1]) : null;
}
async function removePhotos(supabase, urls) {
  const paths = [...new Set(urls.map(storagePathFromUrl).filter(Boolean))];
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error("[KRYPTO] Não foi possível apagar fotos antigas do Storage", error);
}

module.exports = { SIZES, MAX_PHOTOS, BUCKET, MIGRATION_HINT, fail, isMissingSchema, normalizeProduct, uploadPhoto, removePhotos, cleanSizes };
