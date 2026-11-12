// Código compartilhado da vitrine: sacola (localStorage), pedidos do cliente neste navegador (sem conta) e cabeçalho.
(function () {
  const CART_KEY = "krypto-cart-v1";
  const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  let memoryCart = [];

  // ---------- Sacola ----------
  function validLine(l) {
    return l && Number.isSafeInteger(l.product_id) && l.product_id > 0 && Number.isInteger(l.quantity) && l.quantity > 0 && l.quantity <= 10 && typeof l.size === "string" && (l.color === undefined || typeof l.color === "string");
  }
  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(validLine) : [];
    } catch (_) { return memoryCart.filter(validLine); }
  }
  function writeCart(lines) {
    memoryCart = lines;
    try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch (_) { /* navegador sem armazenamento: usa a memória */ }
    window.dispatchEvent(new CustomEvent("krypto:cart"));
  }
  const same = (l, productId, size, color) => l.product_id === productId && l.size === size && (l.color || "") === (color || "");
  const Cart = {
    lines: readCart,
    count: () => readCart().reduce((sum, l) => sum + l.quantity, 0),
    // Soma na linha do mesmo produto+tamanho+cor; `max` limita ao estoque.
    add(productId, size, quantity, max, color = "") {
      const lines = readCart();
      const found = lines.find((l) => same(l, productId, size, color));
      const limit = Math.min(10, max || 10);
      if (found) found.quantity = Math.min(limit, found.quantity + quantity);
      else lines.push({ product_id: productId, size, color, quantity: Math.min(limit, quantity) });
      writeCart(lines);
    },
    setQuantity(productId, size, quantity, color = "") {
      const lines = readCart().map((l) => (same(l, productId, size, color) ? { ...l, quantity } : l)).filter((l) => l.quantity > 0);
      writeCart(lines);
    },
    remove(productId, size, color = "") { writeCart(readCart().filter((l) => !same(l, productId, size, color))); },
    clear() { writeCart([]); },
    replace(lines) { writeCart(lines.filter(validLine)); }
  };

  // ---------- Cores da peça ----------
  const colorsOf = (product) => (product && Array.isArray(product.colors) ? product.colors.filter((c) => c && c.name) : []);
  // Fotos da cor escolhida; sem cores (ou cor desconhecida) usa as fotos gerais da peça.
  function imagesFor(product, colorName) {
    const color = colorsOf(product).find((c) => c.name === colorName);
    const list = color && color.images && color.images.length ? color.images : (product.images && product.images.length ? product.images : [product.image_url]);
    return list.filter(Boolean).slice(0, 4);
  }
  const coverFor = (product, colorName) => imagesFor(product, colorName)[0] || product.image_url;
  // A linha da sacola só é válida se a cor ainda existir na peça.
  const lineColorOk = (product, line) => !product || colorsOf(product).length === 0 ? !line.color : colorsOf(product).some((c) => c.name === line.color);

  // ---------- Catálogo ----------
  let productsPromise = null;
  function loadProducts(force) {
    if (!productsPromise || force) {
      productsPromise = fetch("/api/products").then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível carregar os produtos.");
        return r.json();
      }).catch((e) => { productsPromise = null; throw e; });
    }
    return productsPromise;
  }

  // ---------- Meus pedidos e dados de entrega (somente neste navegador, nada de conta/Supabase Auth) ----------
  const ORDERS_KEY = "krypto-orders-v1", PROFILE_KEY = "krypto-profile-v1";
  let memoryOrders = [], memoryProfile = null;
  function readOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((o) => o && /^[A-F0-9]{8,16}$/.test(String(o.id))) : [];
    } catch (_) { return memoryOrders; }
  }
  function writeOrders(list) {
    memoryOrders = list;
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); } catch (_) { /* sem armazenamento: usa a memória */ }
    window.dispatchEvent(new CustomEvent("krypto:orders"));
  }
  const Orders = {
    list: readOrders,
    count: () => readOrders().length,
    add(id) {
      id = String(id || "").toUpperCase();
      if (!/^[A-F0-9]{8,16}$/.test(id)) return;
      const list = readOrders().filter((o) => o.id !== id);
      list.unshift({ id, at: Date.now() });
      writeOrders(list.slice(0, 20));
    },
    remove(id) { writeOrders(readOrders().filter((o) => o.id !== id)); }
  };
  // Nome, e-mail, telefone e endereço usados na última compra, para não digitar de novo.
  function readProfile() {
    try { const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); return p && typeof p === "object" ? p : null; } catch (_) { return memoryProfile; }
  }
  function writeProfile(profile) {
    memoryProfile = profile;
    try { if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); else localStorage.removeItem(PROFILE_KEY); } catch (_) {}
  }
  const Profile = { read: readProfile, write: writeProfile, clear: () => writeProfile(null) };

  // Só aceita destinos internos simples (ex.: checkout.html), nunca endereços externos.
  function safeNext(value, fallback) {
    return /^[a-z0-9_-]+\.html$/i.test(String(value || "")) ? value : fallback;
  }
  function goCheckout() { location.assign("checkout.html"); }

  // ---------- Cabeçalho (contador da sacola e pedidos) ----------
  function refreshBadge() {
    const n = Cart.count();
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(n); el.hidden = n === 0; });
  }
  function refreshAccount() {
    const n = Orders.count();
    document.querySelectorAll("[data-account-label]").forEach((el) => { el.textContent = n ? `Meus pedidos (${n})` : "Meus pedidos"; });
  }
  window.addEventListener("krypto:cart", refreshBadge);
  window.addEventListener("storage", (e) => { if (e.key === CART_KEY) refreshBadge(); });
  window.addEventListener("krypto:orders", refreshAccount);
document.addEventListener("DOMContentLoaded", () => { refreshBadge(); refreshAccount(); });

  window.Krypto = { colorsOf, imagesFor, coverFor, lineColorOk, money, Cart, Orders, Profile, loadProducts, safeNext, goCheckout, refreshAccount };
})();
