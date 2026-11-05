const { money, Cart } = window.Krypto;
const productGrid = document.querySelector("#product-grid");
const categoryLinks = [...document.querySelectorAll("[data-category]")];
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
let lastFocus = null;

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
    (!q || normalizeText(`${p.name} ${p.category} ${p.description} ${p.tag}`).includes(q)));
  if (sortBy === "price-asc") list.sort((a, b) => a.price_cents - b.price_cents);
  else if (sortBy === "price-desc") list.sort((a, b) => b.price_cents - a.price_cents);
  else if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return list;
}

function productCard(product) {
  const soldOut = Number(product.stock) < 1;
  const card = el("article", undefined, soldOut ? "product-card sold-out" : "product-card");
  let chosenSize = product.sizes.length === 1 ? product.sizes[0] : "";

  const image = el("div", undefined, "product-image");
  image.style.backgroundImage = `url("${product.image_url}")`;
  image.setAttribute("role", "img");
  image.setAttribute("aria-label", product.name);
  if (soldOut) image.append(el("span", "ESGOTADO", "product-tag product-tag-sold"));
  else if (product.tag) image.append(el("span", product.tag, "product-tag"));

  const info = el("div", undefined, "product-info");
  const text = el("div");
  text.append(el("span", product.category.toUpperCase(), "product-category"), el("h3", product.name));
  const lowStock = !soldOut && Number(product.stock) <= 3;
  if (lowStock) text.append(el("p", `Últimas ${product.stock} unidades`, "low-stock"));
  else if (product.description) text.append(el("p", product.description, "product-desc"));
  info.append(text, el("strong", money(product.price_cents), "product-price"));

  const buy = el("div", undefined, "product-buy");
  const message = el("p", "", "product-msg");
  message.setAttribute("role", "status");
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
    Cart.add(product.id, chosenSize, 1, product.stock - (inBag - (Cart.lines().find((l) => l.product_id === product.id && l.size === chosenSize)?.quantity || 0)));
    message.textContent = ""; delete message.dataset.error;
    toast(`${product.name} foi para a sacola.`);
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
  resultsNote.textContent = query || selectedCategory ? `${list.length} ${list.length === 1 ? "peça encontrada" : "peças encontradas"}` : "";
}

function setCategory(category) {
  selectedCategory = category;
  categoryLinks.forEach((item) => item.classList.toggle("active", item.dataset.category === category));
  renderProducts();
}
categoryLinks.forEach((link) => link.addEventListener("click", (e) => { e.preventDefault(); setCategory(link.dataset.category); }));
document.querySelectorAll("[data-nav-category]").forEach((link) => link.addEventListener("click", () => setCategory(link.dataset.navCategory)));
searchInput.addEventListener("input", () => { query = searchInput.value; renderProducts(); });
document.querySelector("#search-form").addEventListener("submit", (e) => { e.preventDefault(); document.querySelector("#colecao").scrollIntoView(); });
sortSelect.addEventListener("change", () => { sortBy = sortSelect.value; renderProducts(); });

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
    if (product) thumb.style.backgroundImage = `url("${product.image_url}")`;
    const body = el("div", undefined, "bag-info");
    if (!product || product.stock < 1) {
      blocked = true;
      body.append(el("strong", product ? product.name : "Produto indisponível"), el("small", "Sem estoque. Remova para continuar.", "bag-warn"));
    } else {
      const qty = Math.min(line.quantity, product.stock, 10);
      subtotal += product.price_cents * qty;
      body.append(el("strong", product.name), el("small", [product.category, line.size ? `Tamanho ${line.size}` : ""].filter(Boolean).join(" · ")));
      const stepper = el("div", undefined, "stepper");
      const minus = el("button", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Diminuir quantidade");
      const plus = el("button", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Aumentar quantidade");
      const total = Cart.lines().filter((l) => l.product_id === product.id).reduce((n, l) => n + l.quantity, 0);
      plus.disabled = qty >= 10 || total >= product.stock;
      minus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, qty - 1));
      plus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, qty + 1));
      stepper.append(minus, el("span", String(qty)), plus);
      body.append(stepper);
      if (qty !== line.quantity) Cart.setQuantity(line.product_id, line.size, qty);
    }
    const side = el("div", undefined, "bag-side");
    if (product) side.append(el("strong", money(product.price_cents * Math.min(line.quantity, product.stock || line.quantity))));
    const remove = el("button", "Remover", "bag-remove"); remove.type = "button";
    remove.addEventListener("click", () => Cart.remove(line.product_id, line.size));
    side.append(remove);
    row.append(thumb, body, side);
    drawerBody.append(row);
  });
  document.querySelector("#drawer-subtotal").textContent = money(subtotal);
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

// "Fazer compra": sem conta/login vai para a tela de entrar/cadastrar; logado segue para o checkout.
document.querySelector("#drawer-buy").addEventListener("click", async (e) => {
  const button = e.currentTarget;
  button.disabled = true;
  await window.Krypto.goCheckout();
  setTimeout(() => { button.disabled = false; }, 4000);
});

// ---------- Faixa de avisos (frete grátis, se a loja tiver) ----------
fetch("/api/shipping").then((r) => (r.ok ? r.json() : null)).then((info) => {
  if (!info) return;
  const text = document.querySelector("#announce-text"), benefit = document.querySelector("#benefit-shipping");
  if (info.free_shipping) { text.textContent = "Frete grátis em todos os pedidos · Pague com PIX"; benefit.textContent = "Frete grátis em todos os pedidos"; }
  else if (info.free_over_cents > 0) {
    text.textContent = `Frete grátis em compras acima de ${money(info.free_over_cents)} · Pague com PIX`;
    benefit.textContent = `Frete grátis acima de ${money(info.free_over_cents)}`;
  }
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
  // Limpa da sacola produtos que saíram do catálogo.
  const ids = new Set(products.map((p) => p.id));
  const kept = Cart.lines().filter((l) => ids.has(l.product_id));
  if (kept.length !== Cart.lines().length) Cart.replace(kept);
}).catch((error) => {
  productGrid.replaceChildren(); productGrid.removeAttribute("aria-busy");
  productGrid.append(el("p", `${error.message} Tente novamente mais tarde.`, "catalog-message"));
});
