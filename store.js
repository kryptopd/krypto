const { money, Cart, colorsOf, imagesFor, coverFor, lineColorOk } = window.Krypto;
const productGrid = document.querySelector("#product-grid");
const mainNav = document.querySelector("#main-nav");
const categoryRow = document.querySelector("#category-row");
const productCount = document.querySelector("#product-count");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const resultsNote = document.querySelector("#results-note");
const drawer = document.querySelector("#cart-drawer");
const overlay = document.querySelector("#drawer-overlay");
const drawerBody = document.querySelector("#drawer-body");
const drawerFoot = document.querySelector("#drawer-foot");
let products = [];
let selectedCategory = "";
let query = "";
let sortBy = "new";
let maxPrice = null;
let inStockOnly = false;
let favoritesOnly = false;
let lastFocus = null;
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

function toast(message) {
  const box = document.querySelector("#toast");
  box.textContent = message; box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 2600);
}

// ---------- Vitrine ----------
function visibleProducts() {
  const q = normalizeText(query);
  const list = products.filter((p) =>
    (!selectedCategory || p.category === selectedCategory) &&
    (!q || normalizeText(`${p.name} ${p.category} ${p.description}`).includes(q)) &&
    (maxPrice === null || Number(p.price_cents) <= maxPrice) &&
    (!inStockOnly || Number(p.stock) > 0) &&
    (!favoritesOnly || isFavorite(p.id)));
  if (sortBy === "price-asc") list.sort((a, b) => a.price_cents - b.price_cents);
  else if (sortBy === "price-desc") list.sort((a, b) => b.price_cents - a.price_cents);
  else if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return list;
}

// Galeria da peça: rolagem lateral com encaixe (arrastar no celular), setas e bolinhas. Até 4 fotos.
function gallery(product, urls) {
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
  const colors = colorsOf(product);
  let chosenSize = product.sizes.length === 1 ? product.sizes[0] : "";
  let chosenColor = colors.length ? colors[0].name : "";

  const buildImage = () => {
    const image = gallery(product, imagesFor(product, chosenColor));
    const favorite = el("button", isFavorite(product.id) ? "♥" : "♡", "product-favorite");
    favorite.type = "button"; favorite.setAttribute("aria-label", isFavorite(product.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"); favorite.setAttribute("aria-pressed", String(isFavorite(product.id)));
    favorite.addEventListener("click", () => toggleFavorite(product.id));
    image.append(favorite);
    if (soldOut) image.append(el("span", "ESGOTADO", "product-tag product-tag-sold"));
    else if (Number(product.stock) <= 3) image.append(el("span", "ÚLTIMAS UNIDADES", "product-tag product-tag-low"));
    return image;
  };
  let image = buildImage();

  const info = el("div", undefined, "product-info");
  const text = el("div");
  if (product.category) text.append(el("span", product.category.toUpperCase(), "product-category"));
  text.append(el("h3", product.name));
  if (product.description) text.append(el("p", product.description, "product-desc"));
  info.append(text, el("strong", money(product.price_cents), "product-price"));

  const buy = el("div", undefined, "product-buy");
  const message = el("p", "", "product-msg");
  message.setAttribute("role", "status");

  // Cores: trocar a cor troca as fotos do cartão.
  if (colors.length) {
    const box = el("div", undefined, "color-picker");
    const label = el("span", undefined, "color-label");
    const setLabel = () => { label.replaceChildren(el("em", "Cor: "), document.createTextNode(chosenColor)); };
    setLabel();
    const swatches = el("div", undefined, "swatches");
    swatches.setAttribute("role", "group"); swatches.setAttribute("aria-label", `Cor de ${product.name}`);
    colors.forEach((color) => {
      const dot = el("button", undefined, "swatch");
      dot.type = "button"; dot.style.setProperty("--swatch", color.hex);
      dot.title = color.name; dot.setAttribute("aria-label", color.name); dot.setAttribute("aria-pressed", String(color.name === chosenColor));
      dot.addEventListener("click", () => {
        if (chosenColor === color.name) return;
        chosenColor = color.name; message.textContent = ""; delete message.dataset.error;
        swatches.querySelectorAll(".swatch").forEach((n) => n.setAttribute("aria-pressed", String(n === dot)));
        setLabel();
        const next = buildImage(); image.replaceWith(next); image = next;
      });
      swatches.append(dot);
    });
    box.append(label, swatches);
    buy.append(box);
  }

  if (!soldOut && product.sizes.length) {
    const sizes = el("div", undefined, "size-picker");
    sizes.setAttribute("role", "group"); sizes.setAttribute("aria-label", `Tamanho de ${product.name}`);
    product.sizes.forEach((size) => {
      const chip = el("button", size, "size-chip");
      chip.type = "button"; chip.setAttribute("aria-pressed", String(size === chosenSize));
      chip.addEventListener("click", () => {
        chosenSize = size; message.textContent = "";
        sizes.querySelectorAll(".size-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      });
      sizes.append(chip);
    });
    buy.append(sizes);
  }
  const add = el("button", soldOut ? "Sem estoque" : "Adicionar à sacola", "button button-primary add-to-cart");
  add.type = "button"; add.disabled = soldOut;
  add.addEventListener("click", () => {
    if (product.sizes.length && !chosenSize) { message.textContent = "Escolha um tamanho."; message.dataset.error = "true"; return; }
    const inBag = Cart.lines().filter((l) => l.product_id === product.id).reduce((n, l) => n + l.quantity, 0);
    if (inBag >= product.stock) { message.textContent = "Você já tem todo o estoque disponível na sacola."; message.dataset.error = "true"; return; }
    Cart.add(product.id, chosenSize, 1, product.stock - inBag + (Cart.lines().find((l) => l.product_id === product.id && l.size === chosenSize && (l.color || "") === chosenColor)?.quantity || 0), chosenColor);
    message.textContent = ""; delete message.dataset.error;
    toast(`${product.name}${chosenColor ? ` (${chosenColor})` : ""} foi para a sacola.`);
  });
  buy.append(message, add);
  card.append(image, info, buy);
  return card;
}

function renderProducts() {
  const list = visibleProducts();
  productGrid.replaceChildren();
  productGrid.removeAttribute("aria-busy");
  if (!list.length) {
    productGrid.append(el("p", products.length ? "Nenhuma peça encontrada. Tente outra busca ou categoria." : "Nenhum produto disponível no momento.", "catalog-message"));
    resultsNote.textContent = "";
    return;
  }
  list.forEach((p) => productGrid.append(productCard(p)));
  const filtersActive = query || selectedCategory || maxPrice !== null || inStockOnly || favoritesOnly;
  resultsNote.textContent = filtersActive ? `${list.length} ${list.length === 1 ? "peça encontrada" : "peças encontradas"}` : `${list.length} ${list.length === 1 ? "peça disponível" : "peças disponíveis"}`;
  updateFavoritesUI();
}

function setCategory(category) {
  selectedCategory = category;
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
searchInput.addEventListener("input", () => { query = searchInput.value; renderProducts(); });
document.querySelector("#search-form").addEventListener("submit", (e) => { e.preventDefault(); document.querySelector("#colecao").scrollIntoView(); });
sortSelect.addEventListener("change", () => { sortBy = sortSelect.value; renderProducts(); });
document.querySelector("#price-max").addEventListener("input", (event) => { const value = Number(event.target.value); maxPrice = event.target.value.trim() && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null; renderProducts(); });
document.querySelector("#in-stock-only").addEventListener("change", (event) => { inStockOnly = event.target.checked; renderProducts(); });
document.querySelector("#favorites-only").addEventListener("click", () => { favoritesOnly = !favoritesOnly; renderProducts(); });
document.querySelector("#clear-filters").addEventListener("click", () => { query = ""; selectedCategory = ""; maxPrice = null; inStockOnly = false; favoritesOnly = false; searchInput.value = ""; sortSelect.value = "new"; document.querySelector("#price-max").value = ""; document.querySelector("#in-stock-only").checked = false; setCategory(""); renderProducts(); });

// ---------- Sacola (gaveta) ----------
function renderDrawer() {
  const lines = Cart.lines();
  drawerBody.replaceChildren();
  document.querySelector("#drawer-count").textContent = lines.length ? `(${Cart.count()})` : "";
  if (!lines.length) {
    drawerFoot.hidden = true;
    const empty = el("div", undefined, "drawer-empty");
    empty.append(el("strong", "Sua sacola está vazia"), el("p", "Escolha quantas peças quiser na vitrine."));
    const go = el("button", "Ver peças", "button button-outline"); go.type = "button"; go.addEventListener("click", closeDrawer);
    empty.append(go); drawerBody.append(empty);
    return;
  }
  let subtotal = 0, blocked = false;
  lines.forEach((line) => {
    const product = productById(line.product_id);
    const row = el("div", undefined, "bag-item");
    const thumb = el("div", undefined, "bag-thumb");
    if (product) thumb.style.backgroundImage = `url("${coverFor(product, line.color)}")`;
    const body = el("div", undefined, "bag-info");
    if (!product || product.stock < 1 || !lineColorOk(product, line)) {
      blocked = true;
      body.append(el("strong", product ? product.name : "Produto indisponível"), el("small", product && product.stock >= 1 ? "Esta cor não está mais disponível. Remova para continuar." : "Sem estoque. Remova para continuar.", "bag-warn"));
    } else {
      const qty = Math.min(line.quantity, product.stock, 10);
      subtotal += product.price_cents * qty;
      body.append(el("strong", product.name), el("small", [line.color, line.size ? `Tamanho ${line.size}` : ""].filter(Boolean).join(" · ") || product.category || ""));
      const stepper = el("div", undefined, "stepper");
      const minus = el("button", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Diminuir quantidade");
      const plus = el("button", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Aumentar quantidade");
      const total = Cart.lines().filter((l) => l.product_id === product.id).reduce((n, l) => n + l.quantity, 0);
      plus.disabled = qty >= 10 || total >= product.stock;
      minus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, qty - 1, line.color));
      plus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, qty + 1, line.color));
      stepper.append(minus, el("span", String(qty)), plus);
      body.append(stepper);
      if (qty !== line.quantity) Cart.setQuantity(line.product_id, line.size, qty, line.color);
    }
    const side = el("div", undefined, "bag-side");
    if (product) side.append(el("strong", money(product.price_cents * Math.min(line.quantity, product.stock || line.quantity))));
    const remove = el("button", "Remover", "bag-remove"); remove.type = "button";
    remove.addEventListener("click", () => Cart.remove(line.product_id, line.size, line.color));
    side.append(remove);
    row.append(thumb, body, side);
    drawerBody.append(row);
  });
  document.querySelector("#drawer-subtotal").textContent = money(subtotal);
  const goal = Number(window.Krypto.freeShippingGoal || 0);
  const progress = document.querySelector("#free-shipping-progress");
  if (progress) {
    if (goal > 0) { const remaining = Math.max(0, goal - subtotal); progress.hidden = false; progress.querySelector("strong").textContent = remaining ? `Faltam ${money(remaining)} para ganhar frete grátis` : "Você desbloqueou o frete grátis!"; progress.querySelector("i").style.width = `${Math.min(100, subtotal / goal * 100)}%`; }
    else progress.hidden = true;
  }
  document.querySelector("#drawer-buy").disabled = blocked;
  drawerFoot.hidden = false;
}
function openDrawer() {
  lastFocus = document.activeElement;
  renderDrawer();
  drawer.hidden = false; overlay.hidden = false;
  document.body.classList.add("drawer-open");
  document.querySelector("#cart-close").focus();
}
function closeDrawer() {
  drawer.hidden = true; overlay.hidden = true;
  document.body.classList.remove("drawer-open");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
document.querySelector("#cart-open").addEventListener("click", openDrawer);
document.querySelector("#cart-close").addEventListener("click", closeDrawer);
document.querySelector("#drawer-continue").addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
window.addEventListener("krypto:cart", () => { if (!drawer.hidden) renderDrawer(); });

// "Fazer compra": vai direto ao checkout, sem cadastro.
document.querySelector("#drawer-buy").addEventListener("click", () => window.Krypto.goCheckout());

// ---------- Faixa de avisos (frete grátis, se a loja tiver) ----------
fetch("/api/shipping").then((r) => (r.ok ? r.json() : null)).then((info) => {
  if (!info) return;
  window.Krypto.freeShippingGoal = Number(info.free_over_cents || 0);
  const text = document.querySelector("#announce-text"), benefit = document.querySelector("#benefit-shipping");
  if (info.free_shipping) { text.textContent = "Frete grátis em todos os pedidos · Pague com PIX"; benefit.textContent = "Frete grátis em todos os pedidos"; }
  else if (info.free_over_cents > 0) {
    text.textContent = `Frete grátis em compras acima de ${money(info.free_over_cents)} · Pague com PIX`;
    benefit.textContent = `Frete grátis acima de ${money(info.free_over_cents)}`;
  }
  if (!drawer.hidden) renderDrawer();
}).catch(() => {});

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

// ---------- Carga inicial ----------
window.Krypto.loadProducts().then((list) => {
  products = list;
  productCount.textContent = String(products.length).padStart(2, "0");
  renderProducts();
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
  productGrid.append(el("p", `${error.message} Tente novamente mais tarde.`, "catalog-message"));
});
