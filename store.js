const { money, Cart, colorsOf, imagesFor, coverFor, lineColorOk, productPath, maxQty } = window.Krypto;
let pixDiscountPercent = 0;
window.Krypto.loadConfig().then((c) => { pixDiscountPercent = c.pix_discount_percent; if (products.length) { renderProducts(); renderNew(); } });
const productGrid = document.querySelector("#product-grid");
const mainNav = document.querySelector("#main-nav");
const categoryRow = document.querySelector("#category-row");
const productCount = document.querySelector("#product-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const resultsNote = document.querySelector("#results-note");
let products = [];
let selectedCategory = "";
let query = "";
let sortBy = "new";
let maxPrice = null;
let inStockOnly = false;
let favoritesOnly = false;
let page = 1;
const PAGE_SIZE = 12;
const sizeFilter = new Set(), colorFilter = new Set();
const FAVORITES_KEY = "krypto-favorites-v1";
const readIds = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v.filter(Number.isSafeInteger) : []; } catch (_) { return []; } };
let favorites = readIds(FAVORITES_KEY);
const saveIds = (key, ids) => { try { localStorage.setItem(key, JSON.stringify(ids)); } catch (_) {} };
const isFavorite = (id) => favorites.includes(id);
function updateFavoritesUI() {
  const count = document.querySelector("#favorites-count");
  if (count) count.textContent = String(favorites.length);
  const button = document.querySelector("#favorites-only");
  if (button) { button.setAttribute("aria-pressed", String(favoritesOnly)); button.classList.toggle("active", favoritesOnly); button.firstChild.textContent = favoritesOnly ? "♥ Favoritos " : "♡ Favoritos "; }
}
function toggleFavorite(id) {
  favorites = isFavorite(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
  saveIds(FAVORITES_KEY, favorites); updateFavoritesUI();
  renderProducts();
  toast(isFavorite(id) ? "Peça adicionada aos favoritos." : "Peça removida dos favoritos.");
}

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const productById = (id) => products.find((p) => p.id === id);
const normalizeText = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const toast = (message, action) => window.Krypto.toast(message, action);

// ---------- Vitrine ----------
// Tamanho e cor: com estoque por variação, só conta combinação que ainda tem peça.
function matchesVariantFilters(p) {
  if (!sizeFilter.size && !colorFilter.size) return true;
  const variants = window.Krypto.variantsOf(p);
  if (variants.length) {
    return variants.some((v) => (!sizeFilter.size || sizeFilter.has(v.size)) && (!colorFilter.size || colorFilter.has(v.color)) && Number(v.stock) > 0);
  }
  const hasSize = !sizeFilter.size || (p.sizes || []).some((s) => sizeFilter.has(s));
  const hasColor = !colorFilter.size || colorsOf(p).some((c) => colorFilter.has(c.name));
  return hasSize && hasColor && Number(p.stock) > 0;
}
function visibleProducts() {
  const q = normalizeText(query);
  const list = products.filter((p) =>
    (!selectedCategory || p.category === selectedCategory) &&
    (!q || normalizeText(`${p.name} ${p.category} ${p.description}`).includes(q)) &&
    (maxPrice === null || Number(p.price_cents) <= maxPrice) &&
    (!inStockOnly || Number(p.stock) > 0) &&
    (!favoritesOnly || isFavorite(p.id)) &&
    matchesVariantFilters(p));
  if (sortBy === "price-asc") list.sort((a, b) => a.price_cents - b.price_cents);
  else if (sortBy === "price-desc") list.sort((a, b) => b.price_cents - a.price_cents);
  else if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return list;
}

// Galeria da peça: rolagem lateral com encaixe (arrastar no celular), setas e bolinhas. Até 4 fotos.
function gallery(product, urls, href) {
  const box = el("div", undefined, "product-image product-gallery");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", urls.length > 1 ? `Fotos de ${product.name}` : product.name);
  const track = el("div", undefined, "gallery-track");
  urls.forEach((url, i) => {
    const img = document.createElement("img");
    img.src = url; img.alt = urls.length > 1 ? `${product.name}, foto ${i + 1} de ${urls.length}` : product.name;
    img.loading = i === 0 ? "eager" : "lazy"; img.decoding = "async"; img.draggable = false;
    track.append(img);
  });
  box.append(track);
  // Clicar na foto abre a página da peça (arrastar para trocar de foto não gera clique).
  if (href) { box.classList.add("is-link"); track.addEventListener("click", () => location.assign(href)); }
  if (urls.length < 2) return box;

  const dots = el("div", undefined, "gallery-dots");
  const dotNodes = urls.map(() => { const d = el("span"); dots.append(d); return d; });
  const prev = el("button", "‹", "gallery-nav gallery-prev"), next = el("button", "›", "gallery-nav gallery-next");
  prev.type = next.type = "button";
  prev.setAttribute("aria-label", "Foto anterior"); next.setAttribute("aria-label", "Próxima foto");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const index = () => Math.max(0, Math.min(urls.length - 1, Math.round((track.scrollLeft || 0) / (track.clientWidth || 1))));
  const sync = () => {
    const i = index();
    dotNodes.forEach((d, n) => d.classList.toggle("on", n === i));
    prev.disabled = i === 0; next.disabled = i === urls.length - 1;
  };
  const go = (delta) => track.scrollTo({ left: (index() + delta) * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
  prev.addEventListener("click", () => go(-1)); next.addEventListener("click", () => go(1));
  track.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });
  box.append(prev, next, dots);
  sync();
  return box;
}

function productCard(product) {
  const soldOut = Number(product.stock) < 1;
  const card = el("article", undefined, soldOut ? "product-card sold-out" : "product-card");
  const href = productPath(product);
  const colors = colorsOf(product);
  let chosenColor = colors.length ? colors[0].name : "";

  const buildImage = () => {
    const image = gallery(product, imagesFor(product, chosenColor), href);
    const favorite = el("button", isFavorite(product.id) ? "♥" : "♡", "product-favorite");
    favorite.type = "button"; favorite.setAttribute("aria-label", isFavorite(product.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"); favorite.setAttribute("aria-pressed", String(isFavorite(product.id)));
    favorite.addEventListener("click", () => toggleFavorite(product.id));
    image.append(favorite);
    image.append(window.Krypto.quickAdd(product, () => chosenColor).root);
    if (soldOut) image.append(el("span", "ESGOTADO", "product-tag product-tag-sold"));
    else if (Number(product.stock) <= 3) image.append(el("span", "ÚLTIMAS UNIDADES", "product-tag product-tag-low"));
    return image;
  };
  let image = buildImage();

  const info = el("div", undefined, "product-info");
  const text = el("div");
  if (product.category) text.append(el("span", product.category.toUpperCase(), "product-category"));
  const title = el("h3"); const link = el("a", product.name); link.href = href; title.append(link);
  text.append(title);
  if (product.description) text.append(el("p", product.description, "product-desc"));
  info.append(text, el("strong", money(product.price_cents), "product-price"));
  if (pixDiscountPercent > 0) info.append(el("small", `${money(Math.round(product.price_cents * (1 - pixDiscountPercent / 100)))} no PIX (${String(pixDiscountPercent).replace(".", ",")}% off)`, "product-pix"));

  const buy = el("div", undefined, "product-buy");
  buy.append(window.Krypto.purchasePanel(product, {
    compact: true,
    onColor: (name) => { chosenColor = name; const next = buildImage(); image.replaceWith(next); image = next; }
  }).root);
  card.append(image, info, buy);
  return card;
}

const filtersActive = () => Boolean(query || selectedCategory || maxPrice !== null || inStockOnly || favoritesOnly || sizeFilter.size || colorFilter.size);
function clearAllFilters() {
  query = ""; selectedCategory = ""; maxPrice = null; inStockOnly = false; favoritesOnly = false; sizeFilter.clear(); colorFilter.clear();
  searchInput.value = ""; sortSelect.value = "new"; sortBy = "new";
  document.querySelector("#price-max").value = ""; document.querySelector("#in-stock-only").checked = false;
  syncFilterUI(); setCategory("");
}
function stateBox(title, text, label, onClick) {
  const box = el("div", undefined, "empty-state");
  box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Zm3.5 0V6.5a3.5 3.5 0 0 1 7 0V8"/></svg>';
  box.append(el("strong", title), el("p", text));
  if (label) { const b = el("button", label, "button button-outline"); b.type = "button"; b.addEventListener("click", onClick); box.append(b); }
  return box;
}
function renderProducts() {
  const list = visibleProducts();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page > pages) page = pages;
  productGrid.replaceChildren();
  productGrid.removeAttribute("aria-busy");
  if (!list.length) {
    productGrid.append(products.length
      ? stateBox("Nenhuma peça encontrada", "Tente outros filtros, outra busca ou veja todas as peças.", "Limpar filtros", clearAllFilters)
      : stateBox("A coleção está sendo preparada", "Ainda não há peças disponíveis. Volte em breve!", "", null));
    resultsNote.textContent = "";
    renderPager(0, 1);
    return;
  }
  list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach((p) => productGrid.append(productCard(p)));
  const from = (page - 1) * PAGE_SIZE + 1, to = Math.min(page * PAGE_SIZE, list.length);
  resultsNote.textContent = `${filtersActive() ? `${list.length} ${list.length === 1 ? "peça encontrada" : "peças encontradas"}` : `${list.length} ${list.length === 1 ? "peça disponível" : "peças disponíveis"}`}${pages > 1 ? ` · mostrando ${from}–${to}` : ""}`;
  renderPager(list.length, pages);
  updateFavoritesUI();
}

// Paginação numerada: ‹ 1 2 3 … 9 ›
function renderPager(total, pages) {
  const nav = document.querySelector("#pager");
  nav.replaceChildren();
  nav.hidden = pages <= 1;
  if (pages <= 1) return;
  const go = (n) => { page = n; renderProducts(); document.querySelector("#colecao").scrollIntoView({ behavior: "smooth" }); };
  const btn = (label, n, opts = {}) => {
    const b = el("button", label, `pager-btn${opts.current ? " current" : ""}`); b.type = "button";
    if (opts.aria) b.setAttribute("aria-label", opts.aria);
    if (opts.current) b.setAttribute("aria-current", "page");
    b.disabled = Boolean(opts.disabled);
    if (!opts.disabled && !opts.current) b.addEventListener("click", () => go(n));
    return b;
  };
  nav.append(btn("‹", page - 1, { aria: "Página anterior", disabled: page === 1 }));
  const shown = new Set([1, pages, page, page - 1, page + 1].filter((n) => n >= 1 && n <= pages));
  let last = 0;
  [...shown].sort((a, b) => a - b).forEach((n) => {
    if (n - last > 1) nav.append(el("span", "…", "pager-gap"));
    nav.append(btn(String(n), n, { current: n === page, aria: `Página ${n}` }));
    last = n;
  });
  nav.append(btn("›", page + 1, { aria: "Próxima página", disabled: page === pages }));
}

// Filtros de tamanho e cor, montados com o que existe nas peças da vitrine.
function renderFilterOptions() {
  const order = ["PP", "P", "M", "G", "GG", "G1", "G2"];
  const sizes = [...new Set(products.flatMap((p) => p.sizes || []))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const colors = new Map();
  products.forEach((p) => colorsOf(p).forEach((c) => { if (!colors.has(c.name.toLowerCase())) colors.set(c.name.toLowerCase(), c); }));
  const sizeBox = document.querySelector("#filter-sizes"), colorBox = document.querySelector("#filter-colors");
  sizeBox.replaceChildren(); colorBox.replaceChildren();
  sizes.forEach((size) => {
    const b = el("button", size, "size-chip"); b.type = "button"; b.dataset.size = size; b.setAttribute("aria-pressed", String(sizeFilter.has(size)));
    b.addEventListener("click", () => { sizeFilter.has(size) ? sizeFilter.delete(size) : sizeFilter.add(size); syncFilterUI(); page = 1; renderProducts(); });
    sizeBox.append(b);
  });
  [...colors.values()].forEach((c) => {
    const b = el("button", undefined, "swatch"); b.type = "button"; b.dataset.color = c.name; b.style.setProperty("--swatch", c.hex);
    b.title = c.name; b.setAttribute("aria-label", c.name); b.setAttribute("aria-pressed", String(colorFilter.has(c.name)));
    b.addEventListener("click", () => { colorFilter.has(c.name) ? colorFilter.delete(c.name) : colorFilter.add(c.name); syncFilterUI(); page = 1; renderProducts(); });
    colorBox.append(b);
  });
  document.querySelector("#filter-sizes-group").hidden = sizes.length === 0;
  document.querySelector("#filter-colors-group").hidden = colors.size === 0;
  document.querySelector("#catalog-filters").hidden = sizes.length === 0 && colors.size === 0;
}
function syncFilterUI() {
  document.querySelectorAll("#filter-sizes .size-chip").forEach((b) => b.setAttribute("aria-pressed", String(sizeFilter.has(b.dataset.size))));
  document.querySelectorAll("#filter-colors .swatch").forEach((b) => b.setAttribute("aria-pressed", String(colorFilter.has(b.dataset.color))));
}

function setCategory(category) {
  selectedCategory = category; page = 1;
  document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item.dataset.category === category));
  renderProducts();
}
document.querySelector('[data-category=""]').addEventListener("click", (e) => { e.preventDefault(); setCategory(""); });
document.querySelector('[data-nav-category=""]').addEventListener("click", () => setCategory(""));

// Categorias criadas no painel: só aparecem as que têm peça na vitrine.
function renderCategoryLinks(names) {
  document.querySelectorAll(".dyn-category").forEach((n) => n.remove());
  const sortBox = categoryRow.querySelector(".sort-box");
  names.forEach((name) => {
    const chip = el("a", name, "category dyn-category");
    chip.href = "#colecao"; chip.dataset.category = name;
    chip.addEventListener("click", (e) => { e.preventDefault(); setCategory(name); });
    categoryRow.insertBefore(chip, sortBox);
    const link = el("a", name, "dyn-category");
    link.href = "#colecao"; link.dataset.navCategory = name;
    link.addEventListener("click", () => setCategory(name));
    mainNav.append(link);
  });
  if (selectedCategory && !names.includes(selectedCategory)) selectedCategory = "";
  document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item.dataset.category === selectedCategory));
}
// Vitrine de categorias (estilo loja grande): um bloco com foto por categoria que tem peças.
function renderCategoryTiles(names) {
  const box = document.querySelector("#category-tiles"), section = document.querySelector("#categorias-destaque");
  if (!box || !section) return;
  box.replaceChildren();
  names.forEach((name) => {
    const sample = products.find((p) => p.category === name);
    const count = products.filter((p) => p.category === name).length;
    const tile = el("a", undefined, "cat-tile");
    tile.href = "#colecao";
    if (sample) tile.style.backgroundImage = `url("${coverFor(sample, colorsOf(sample)[0] && colorsOf(sample)[0].name)}")`;
    const label = el("span", undefined, "cat-tile-label");
    label.append(el("strong", name), el("small", `${count} ${count === 1 ? "peça" : "peças"}`));
    tile.append(label);
    tile.addEventListener("click", (e) => { e.preventDefault(); setCategory(name); document.querySelector("#colecao").scrollIntoView({ behavior: "smooth" }); });
    box.append(tile);
  });
  section.hidden = names.length === 0;
}
async function loadCategoryNames() {
  const inUse = new Set(products.map((p) => p.category).filter(Boolean));
  try {
    const response = await fetch("/api/products?categories=1");
    if (!response.ok) throw new Error("categorias indisponíveis");
    const listed = (await response.json()).map((c) => c.name);
    return listed.filter((name) => inUse.has(name));
  } catch (_) { return [...inUse]; }   // sem a lista, usa as categorias das próprias peças
}
sortSelect.addEventListener("change", () => { sortBy = sortSelect.value; page = 1; renderProducts(); });
document.querySelector("#price-max").addEventListener("input", (event) => { const value = Number(event.target.value); maxPrice = event.target.value.trim() && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null; page = 1; renderProducts(); });
document.querySelector("#in-stock-only").addEventListener("change", (event) => { inStockOnly = event.target.checked; page = 1; renderProducts(); });
document.querySelector("#favorites-only").addEventListener("click", () => { favoritesOnly = !favoritesOnly; page = 1; renderProducts(); });
document.querySelector("#clear-filters").addEventListener("click", clearAllFilters);

// Usado pelo menu do celular e pelos links com ?categoria= / ?q=
function applyFromOutside({ category, query: q } = {}) {
  if (category !== undefined) selectedCategory = category || "";
  if (q !== undefined) { query = q || ""; searchInput.value = query; }
  setCategory(selectedCategory);
  document.querySelector("#colecao").scrollIntoView({ behavior: "smooth" });
}
window.Krypto.onHome = applyFromOutside;

// ---------- Busca com sugestões (autocomplete com as peças da loja) ----------
(() => {
  const form = document.querySelector("#search-form"), list = document.querySelector("#search-suggest");
  let items = [], active = -1;
  const close = () => { list.hidden = true; searchInput.setAttribute("aria-expanded", "false"); searchInput.removeAttribute("aria-activedescendant"); active = -1; };
  const score = (p, q) => {
    const name = normalizeText(p.name);
    if (name.startsWith(q)) return 3;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    if (name.includes(q)) return 1.5;
    if (normalizeText(`${p.category} ${p.description}`).includes(q)) return 1;
    return 0;
  };
  const highlight = (text, q) => {
    const frag = document.createDocumentFragment(), raw = String(text), norm = normalizeText(raw), at = norm.indexOf(q);
    if (at < 0) { frag.append(raw); return frag; }
    frag.append(raw.slice(0, at)); frag.append(el("mark", raw.slice(at, at + q.length))); frag.append(raw.slice(at + q.length));
    return frag;
  };
  const setActive = (n) => {
    active = n;
    list.querySelectorAll("[role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === n)));
    if (n >= 0) searchInput.setAttribute("aria-activedescendant", list.children[n].id); else searchInput.removeAttribute("aria-activedescendant");
  };
  const applyQuery = (q) => { close(); applyFromOutside({ query: q }); searchInput.blur(); };
  function render() {
    const q = normalizeText(searchInput.value.trim());
    if (q.length < 2) { close(); return; }
    items = products.map((p) => ({ p, s: score(p, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.p);
    list.replaceChildren();
    items.forEach((p, i) => {
      const li = el("li", undefined, "suggest-item"); li.id = `sg-${i}`; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
      const a = el("a"); a.href = productPath(p);
      const thumb = el("span", undefined, "suggest-thumb"); thumb.style.backgroundImage = `url("${String(coverFor(p, (colorsOf(p)[0] || {}).name)).replace(/["\\]/g, "")}")`;
      const text = el("span", undefined, "suggest-text"); const name = el("strong"); name.append(highlight(p.name, q));
      text.append(name, el("small", p.category || "KRYPTO"));
      a.append(thumb, text, el("span", money(p.price_cents), "suggest-price"));
      li.append(a); list.append(li);
    });
    const all = el("li", undefined, "suggest-all"); all.id = `sg-${items.length}`; all.setAttribute("role", "option"); all.setAttribute("aria-selected", "false");
    const total = products.filter((p) => score(p, q) > 0).length;
    const b = el("button", total ? `Ver todos os resultados para “${searchInput.value.trim()}” (${total})` : `Nenhuma peça para “${searchInput.value.trim()}”. Ver todas as peças`, "suggest-all-btn"); b.type = "button";
    b.addEventListener("click", () => applyQuery(total ? searchInput.value.trim() : ""));
    all.append(b); list.append(all);
    list.hidden = false; searchInput.setAttribute("aria-expanded", "true"); active = -1;
  }
  searchInput.addEventListener("input", render);
  searchInput.addEventListener("focus", render);
  searchInput.addEventListener("keydown", (e) => {
    if (list.hidden && e.key !== "Enter") return;
    const count = list.children.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % count); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + count) % count); }
    else if (e.key === "Escape") close();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const choice = active >= 0 ? list.children[active] : null;
    if (choice && choice.querySelector("a")) location.assign(choice.querySelector("a").href);
    else applyQuery(searchInput.value.trim());
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) close(); });
})();

// ---------- Faixa de avisos (frete grátis, se a loja tiver) ----------
window.Krypto.loadShippingInfo().then((info) => {
  if (!info) return;
  const text = document.querySelector("#announce-text"), benefit = document.querySelector("#benefit-shipping");
  if (info.free_shipping) { text.textContent = "Frete grátis em todos os pedidos · Pague com PIX"; benefit.textContent = "Frete grátis em todos os pedidos"; }
  else if (info.free_over_cents > 0) {
    text.textContent = `Frete grátis em compras acima de ${money(info.free_over_cents)} · Pague com PIX`;
    benefit.textContent = `Frete grátis acima de ${money(info.free_over_cents)}`;
  }
});

// ---------- Acesso discreto ao painel: 5 cliques rápidos no "©" do rodapé ----------
(() => {
  const mark = document.querySelector("#copyright-mark");
  if (!mark) return;
  let clicks = 0, timer = null;
  mark.addEventListener("click", () => {
    clicks += 1; clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 3000);
    if (clicks >= 5) location.assign("admin.html");
  });
})();

// ---------- Lançamentos, banner, avaliações e chamada final ----------
function renderNew() {
  const section = document.querySelector("#novidades"), box = document.querySelector("#new-carousel");
  const picks = products.slice(0, 8);   // a API já devolve do mais novo para o mais antigo
  if (picks.length < 4) { section.hidden = true; return; }
  box.replaceChildren(...picks.map((p) => window.Krypto.miniCard(p, pixDiscountPercent)));
  section.hidden = false;
  const step = () => Math.max(200, box.clientWidth * 0.85);
  document.querySelector("#new-prev").onclick = () => box.scrollBy({ left: -step(), behavior: "smooth" });
  document.querySelector("#new-next").onclick = () => box.scrollBy({ left: step(), behavior: "smooth" });
}
function renderBanner(cfg) {
  const box = document.querySelector("#promo-banner"), b = cfg.banner;
  if (!b || !b.title) { box.hidden = true; return; }
  box.replaceChildren();
  const card = el("div", undefined, `promo-card${b.image_url ? " has-image" : ""}`);
  if (b.image_url && /^https:\/\//i.test(b.image_url)) card.style.backgroundImage = `linear-gradient(90deg, rgba(8,7,10,.86), rgba(8,7,10,.35)), url("${b.image_url.replace(/["\\]/g, "")}")`;
  const text = el("div", undefined, "promo-copy");
  text.append(el("span", "EM DESTAQUE", "eyebrow"), el("h2", b.title));
  if (b.text) text.append(el("p", b.text));
  card.append(text);
  if (b.cta_label && b.cta_url) { const a = el("a", b.cta_label, "button button-light"); a.href = b.cta_url; card.append(a); }
  box.append(card); box.hidden = false;
}
function renderContactCta(cfg) {
  const section = document.querySelector("#contato"), link = document.querySelector("#cta-link");
  const insta = cfg.instagram && /^https:\/\//i.test(cfg.instagram) ? cfg.instagram : "";
  const wa = cfg.whatsapp ? `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(cfg.whatsapp_message || "")}` : "";
  if (!insta && !wa) { section.hidden = true; return; }
  link.href = insta || wa;
  link.firstChild.textContent = insta ? "Seguir no Instagram " : "Chamar no WhatsApp ";
  document.querySelector("#cta-text").textContent = insta && wa ? "Novidades e peças limitadas no Instagram. Dúvidas? Chame no WhatsApp." : "Novidades, peças limitadas e atendimento direto.";
  section.hidden = false;
}
function renderHomeReviews() {
  fetch("/api/reviews").then((r) => (r.ok ? r.json() : [])).then((rows) => {
    const section = document.querySelector("#home-reviews"), box = document.querySelector("#review-strip");
    if (!rows.length) { section.hidden = true; return; }
    const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
    box.replaceChildren(...rows.slice(0, 6).map((r) => {
      const card = el("article", undefined, "review-card");
      card.append(el("div", stars(r.rating), "review-stars"), el("p", r.comment), el("small", `${r.customer_name} · ${r.product_name}`));
      return card;
    }));
    section.hidden = false;
  }).catch(() => {});
}

// ---------- Carga inicial ----------
function startCatalog(force) {
  productGrid.setAttribute("aria-busy", "true");
  window.Krypto.loadProducts(force === true).then((list) => {
    products = list;
    productCount.textContent = String(products.length).padStart(2, "0");
    const params = new URLSearchParams(location.search);
    if (params.get("categoria")) selectedCategory = params.get("categoria");
    if (params.get("q")) { query = params.get("q"); searchInput.value = query; }
    renderFilterOptions();
    renderProducts();
    renderNew();
    updateFavoritesUI();
    loadCategoryNames().then((names) => { renderCategoryLinks(names); renderCategoryTiles(names); renderProducts(); });
    // Limpa da sacola produtos que saíram do catálogo.
    const ids = new Set(products.map((p) => p.id));
    favorites = favorites.filter((id) => ids.has(id)); saveIds(FAVORITES_KEY, favorites);
    updateFavoritesUI();
    const kept = Cart.lines().filter((l) => ids.has(l.product_id));
    if (kept.length !== Cart.lines().length) Cart.replace(kept);
  }).catch((error) => {
    productGrid.replaceChildren(); productGrid.removeAttribute("aria-busy");
    productGrid.append(stateBox("Não foi possível carregar as peças", "Confira sua conexão e tente de novo.", "Tentar de novo", () => startCatalog(true)));
  });
}
startCatalog();
window.Krypto.loadConfig().then((cfg) => { renderBanner(cfg); renderContactCta(cfg); });
renderHomeReviews();
