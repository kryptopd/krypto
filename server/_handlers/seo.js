const { getSupabase, getSiteUrl, sendError } = require('../_lib/supabase');
const { readStoreSettings } = require('../_lib/settings');

// Páginas que o Google precisa enxergar: página de cada produto (HTML completo, com dados estruturados),
// sitemap.xml e robots.txt. Rotas: /produto/:slug, /sitemap.xml, /robots.txt (ver vercel.json e api/index.js).
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (name) => String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "peca";
const productPath = (p) => `/produto/${p.id}-${slugify(p.name)}`;
// JSON seguro dentro de <script>: "<" vira < para ninguém fechar a tag antes da hora.
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");
const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);

const COLUMN_SETS = [
  "id,name,category,price_cents,stock,sizes,image_url,images,colors,variants,description,active,created_at,compare_at_cents,composition,care,featured,publish_at",
  "id,name,category,price_cents,stock,sizes,image_url,images,colors,variants,description,active,created_at",
  "id,name,category,price_cents,stock,sizes,image_url,images,colors,description,active,created_at",
  "id,name,category,price_cents,stock,sizes,image_url,images,description,active"
];
async function loadProducts(db, id) {
  let data = null, error = null;
  for (const columns of COLUMN_SETS) {
    let q = db.from("products").select(columns).eq("active", true);
    q = id ? q.eq("id", id).limit(1) : q.order("created_at", { ascending: false });
    ({ data, error } = await q);
    if (!error || !["42703", "PGRST204"].includes(error.code)) break;
  }
  if (error) throw error;
  const now = Date.now();
  return (data || []).filter((p) => !p.publish_at || new Date(p.publish_at).getTime() <= now);   // lançamento agendado
}

function layout({ title, description, canonical, image, jsonLd, body, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0b0a0e">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="product">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="KRYPTO">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${extraHead}
<script type="application/ld+json">${safeJson(jsonLd)}</script>
</head>
<body class="pdp-page">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${body}
</body>
</html>`;
}

const HEADER = `<div class="announce" role="region" aria-label="Avisos da loja"><span>Pague com PIX · Entrega para todo o Brasil</span></div>
<header class="site-header store-header">
  <button class="menu-toggle" type="button" data-menu-open aria-label="Abrir menu" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  <a class="brand" href="/" aria-label="KRYPTO, página inicial"><svg class="brand-crown" viewBox="0 0 40 32" aria-hidden="true"><path d="M4 25 2 8l10 8L20 2l8 14 10-8-2 17H4Zm1 4h30" /></svg><span>KRYPTO<span class="brand-dot">.</span></span></a>
  <nav class="main-nav" aria-label="Navegação principal"><a href="/#colecao">Loja</a><a href="/avaliacoes.html">Avaliações</a><a href="/atendimento.html">Atendimento</a></nav>
  <div class="header-actions">
    <a class="header-account" href="/conta.html" aria-label="Meus pedidos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9c.6-3.9 3.7-6 8-6s7.4 2.1 8 6" /></svg><span data-account-label>Meus pedidos</span></a>
    <a class="header-cart" id="cart-open" href="/checkout.html" aria-label="Abrir sacola"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Zm3.5 0V6.5a3.5 3.5 0 0 1 7 0V8" /></svg><span class="cart-label">Sacola</span><b class="cart-badge" data-cart-count hidden>0</b></a>
  </div>
</header>`;

const FOOTER = `<footer class="site-footer site-footer-expanded">
  <div class="footer-main">
    <div class="footer-brand-col"><a class="brand" href="/"><svg class="brand-crown" viewBox="0 0 40 32" aria-hidden="true"><path d="M4 25 2 8l10 8L20 2l8 14 10-8-2 17H4Zm1 4h30" /></svg><span>KRYPTO<span class="brand-dot">.</span></span></a><p>VISTA SUA ATITUDE.<br>FEITA PARA QUEM FAZ AS PRÓPRIAS REGRAS.</p></div>
    <div class="footer-col"><strong>EXPLORAR</strong><a href="/#colecao">Coleção</a><a href="/#sobre">Nossa história</a><a href="/conta.html">Meus pedidos</a></div>
    <div class="footer-col" id="footer-contact"><strong>KRYPTO</strong><span>Moda urbana independente.</span></div>
    <div class="footer-col"><strong>AJUDA</strong><a href="/atendimento.html">Central de atendimento</a><a href="/avaliacoes.html">Avaliações e comentários</a><a href="/trocas-devolucoes.html">Trocas e devoluções</a><a href="/termos.html">Termos de compra</a><a href="/privacidade.html">Privacidade</a></div>
  </div>
  <div class="footer-bottom"><small>© 2026 KRYPTO. Todos os direitos reservados.</small><small>MODA URBANA · BRASIL</small></div>
</footer>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;

async function productPage(req, res) {
  const raw = String(req.query.slug || "");
  const id = Number((/^(\d+)(?:-|$)/.exec(raw) || [])[1]);
  if (!Number.isSafeInteger(id) || id < 1) return notFound(res);
  const db = getSupabase();
  const [product] = await loadProducts(db, id);
  if (!product) return notFound(res);
  const base = getSiteUrl(req);
  const path = productPath(product);
  // Endereço canônico: o mesmo produto não pode existir em dois endereços.
  if (raw !== path.replace("/produto/", "")) { res.statusCode = 301; res.setHeader("Location", path); return res.end(); }

  // Avaliações aprovadas desta peça.
  let reviews = [];
  const rv = await db.from("reviews").select("id,customer_name,rating,comment,created_at").eq("status", "approved").eq("product_id", id).order("created_at", { ascending: false }).limit(20);
  if (!rv.error) reviews = rv.data || [];
  const count = reviews.length, avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

  const colors = Array.isArray(product.colors) ? product.colors : [];
  const images = (colors[0] && colors[0].images && colors[0].images.length ? colors[0].images : (product.images && product.images.length ? product.images : [product.image_url])).filter(Boolean);
  const inStock = Number(product.stock) > 0;
  const description = (String(product.description || "").replace(/\s+/g, " ").trim() || `${product.name}: moda urbana KRYPTO. Entrega para todo o Brasil.`).slice(0, 300);
  const url = `${base}${path}`;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: product.name, description, sku: String(product.id),
    image: [...new Set([...images, ...colors.flatMap((c) => c.images || [])])].slice(0, 10),
    brand: { "@type": "Brand", name: "KRYPTO" },
    ...(product.category ? { category: product.category } : {}),
    offers: { "@type": "Offer", url, priceCurrency: "BRL", price: (Number(product.price_cents) / 100).toFixed(2), itemCondition: "https://schema.org/NewCondition", availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
    ...(count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: count } } : {}),
    ...(count ? { review: reviews.slice(0, 5).map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.customer_name }, datePublished: String(r.created_at).slice(0, 10), reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 }, reviewBody: r.comment })) } : {})
  };
  const clientProduct = { id: product.id, name: product.name, category: product.category || "", price_cents: product.price_cents, stock: product.stock, sizes: product.sizes || [], image_url: product.image_url, images: product.images || [], colors, variants: product.variants || [], description: product.description || "", compare_at_cents: product.compare_at_cents || null };

  const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  const reviewsHtml = count
    ? `<div class="pdp-rating"><strong>${avg.toFixed(1).replace(".", ",")}</strong><span class="review-stars" aria-hidden="true">${stars(avg)}</span><small>${count} ${count === 1 ? "avaliação" : "avaliações"} de clientes que receberam a peça</small></div>` +
      reviews.map((r) => `<article class="review-public"><div class="review-stars" aria-label="${r.rating} de 5 estrelas">${stars(r.rating)}</div><p>${esc(r.comment)}</p><small>${esc(r.customer_name)} · ${new Date(r.created_at).toLocaleDateString("pt-BR")} · compra verificada</small></article>`).join("")
    : `<p class="service-muted">Ainda não há avaliações desta peça. Só quem recebeu o pedido pode avaliar.</p>`;

  const body = `${HEADER}
<main class="pdp-main" id="conteudo" tabindex="-1">
  <nav class="crumbs" aria-label="Você está em"><a href="/">Loja</a><span>/</span>${product.category ? `<a href="/#colecao">${esc(product.category)}</a><span>/</span>` : ""}<strong>${esc(product.name)}</strong></nav>
  <section class="pdp">
    <div class="pdp-gallery" id="pdp-gallery"><div class="pdp-stage"><div class="pdp-track"><img src="${esc(images[0] || "")}" alt="${esc(product.name)}" fetchpriority="high"></div></div></div>
    <div class="pdp-info">
      ${product.category ? `<span class="product-category">${esc(String(product.category).toUpperCase())}</span>` : ""}
      <h1>${esc(product.name)}</h1>
      <p class="pdp-price" id="pdp-price">${product.compare_at_cents && product.compare_at_cents > product.price_cents ? `<s class="price-old" aria-label="Preço original">${money(product.compare_at_cents)}</s> ` : ""}<span>${money(product.price_cents)}</span>${product.compare_at_cents && product.compare_at_cents > product.price_cents ? ` <em class="off-tag">-${Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}%</em>` : ""}</p>
      <p class="pdp-pix" id="pdp-pix" hidden></p>
      ${product.description ? `<p class="pdp-desc">${esc(product.description)}</p>` : ""}
      <div id="pdp-purchase"></div>
      ${product.composition || product.care ? `<div class="pdp-details">${product.composition ? `<details open><summary>Composição</summary><p>${esc(product.composition)}</p></details>` : ""}${product.care ? `<details><summary>Cuidados</summary><p>${esc(product.care)}</p></details>` : ""}</div>` : ""}
      <ul class="pdp-perks">
        <li><strong>Entrega para todo o Brasil</strong><small>Frete calculado no checkout pelo seu estado.</small></li>
        <li><strong>Compra segura</strong><small>PIX ou cartão pelo Mercado Pago.</small></li>
        <li><strong>Troca e devolução</strong><small><a href="/trocas-devolucoes.html">Veja a política</a></small></li>
      </ul>
    </div>
  </section>
  <section class="pdp-reviews" aria-labelledby="rev-title">
    <div class="section-heading"><div><span class="eyebrow">QUEM JÁ RECEBEU</span><h2 id="rev-title">Avaliações</h2></div><a class="button button-ghost" href="/avaliacoes.html">Recebeu esta peça? Avalie</a></div>
    <div class="pdp-review-list">${reviewsHtml}</div>
  </section>
</main>
${FOOTER}
<script type="application/json" id="product-data">${safeJson(clientProduct)}</script>
<script src="/shop.js"></script>
<script src="/purchase.js"></script>
<script src="/bag.js"></script>
<script src="/produto.js" defer></script>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res.status(200).send(layout({ title: `${product.name} — KRYPTO`, description, canonical: url, image: images[0], jsonLd, body }));
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Peça não encontrada — KRYPTO</title><link rel="stylesheet" href="/styles.css"></head><body><main class="account-main"><div class="account-card"><h1>Peça não <span>encontrada.</span></h1><p class="account-lead">Esta peça saiu da loja ou o endereço está incorreto.</p><a class="button button-primary" href="/">Ver a coleção</a></div></main></body></html>`);
}

async function sitemap(req, res) {
  const base = getSiteUrl(req);
  const products = await loadProducts(getSupabase());
  const urls = [{ loc: `${base}/`, priority: "1.0" }, ...["avaliacoes", "atendimento", "trocas-devolucoes", "termos", "privacidade"].map((p) => ({ loc: `${base}/${p}.html`, priority: "0.3" })),
    ...products.map((p) => ({ loc: `${base}${productPath(p)}`, lastmod: p.created_at ? String(p.created_at).slice(0, 10) : "", priority: "0.8" }))];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`).join("\n")}\n</urlset>\n`);
}

// Feed de produtos para Google Merchant Center (Google Shopping) e catálogo do Meta (Instagram/Facebook Shopping).
// Uma linha por combinação cor x tamanho quando a peça tem estoque por variação.
async function feed(req, res) {
  const base = getSiteUrl(req);
  const products = await loadProducts(getSupabase());
  const x = (v) => String(v == null ? "" : v).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const price = (c) => `${(Number(c) / 100).toFixed(2)} BRL`;
  const items = [];
  for (const p of products) {
    const colors = Array.isArray(p.colors) ? p.colors : [], variants = Array.isArray(p.variants) ? p.variants : [];
    const rows = variants.length ? variants : [{ color: "", size: "", stock: p.stock }];
    for (const v of rows) {
      const color = colors.find((c) => c.name === v.color);
      const images = (color && color.images && color.images.length ? color.images : (p.images && p.images.length ? p.images : [p.image_url])).filter(Boolean);
      const id = variants.length ? [p.id, slugify(v.color), slugify(v.size)].filter((s) => s !== "peca" || false).join("-").replace(/-+/g, "-") : String(p.id);
      const title = [p.name, v.color, v.size].filter(Boolean).join(" - ");
      const sale = Number(p.compare_at_cents) > Number(p.price_cents);
      items.push(`    <item>
      <g:id>${x(id)}</g:id>
      <g:title>${x(title.slice(0, 150))}</g:title>
      <g:description>${x((p.description || `${p.name} - moda urbana KRYPTO.`).slice(0, 4900))}</g:description>
      <g:link>${x(base + productPath(p))}</g:link>
      <g:image_link>${x(images[0] || "")}</g:image_link>${images.slice(1, 6).map((u) => `\n      <g:additional_image_link>${x(u)}</g:additional_image_link>`).join("")}
      <g:availability>${Number(v.stock) > 0 ? "in stock" : "out of stock"}</g:availability>
      <g:price>${price(sale ? p.compare_at_cents : p.price_cents)}</g:price>${sale ? `\n      <g:sale_price>${price(p.price_cents)}</g:sale_price>` : ""}
      <g:brand>KRYPTO</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:item_group_id>${p.id}</g:item_group_id>${v.color ? `\n      <g:color>${x(v.color)}</g:color>` : ""}${v.size ? `\n      <g:size>${x(v.size)}</g:size>` : ""}${p.category ? `\n      <g:product_type>${x(p.category)}</g:product_type>` : ""}
      <g:google_product_category>1604</g:google_product_category>
    </item>`);
    }
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>KRYPTO</title>
    <link>${x(base)}</link>
    <description>Moda urbana KRYPTO</description>
${items.join("\n")}
  </channel>
</rss>
`);
}

// Arquivo de verificação do Google Search Console: /googleXXXX.html (o nome vem das Configurações).
async function googleVerify(req, res) {
  const store = await readStoreSettings(getSupabase());
  const file = String(req.query.file || "");
  if (!store.google_verification || file !== store.google_verification) return notFound(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300");
  return res.status(200).send(`google-site-verification: ${file}`);
}

function robots(req, res) {
  const base = getSiteUrl(req);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600");
  return res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /checkout.html\nDisallow: /pedido.html\nDisallow: /conta.html\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
}

module.exports = async function handler(req, res) {
  try {
    const kind = req.query.kind;
    if (kind === "sitemap") return await sitemap(req, res);
    if (kind === "robots") return robots(req, res);
    if (kind === "feed") return await feed(req, res);
    if (kind === "gverify") return await googleVerify(req, res);
    return await productPage(req, res);
  } catch (error) { return sendError(res, error); }
};
