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

  // ---------- Estoque por variação (cor x tamanho) ----------
  const variantsOf = (product) => (product && Array.isArray(product.variants) ? product.variants : []);
  // Unidades da combinação; sem variações cadastradas vale o estoque total da peça.
  function stockFor(product, color, size) {
    const v = variantsOf(product);
    if (!v.length) return Number(product.stock) || 0;
    const hit = v.find((x) => (x.color || "") === (color || "") && (x.size || "") === (size || ""));
    return hit ? Number(hit.stock) || 0 : 0;
  }
  // Unidades de uma cor somando todos os tamanhos.
  function colorStock(product, color) {
    const v = variantsOf(product);
    if (!v.length) return Number(product.stock) || 0;
    return v.filter((x) => (x.color || "") === (color || "")).reduce((n, x) => n + (Number(x.stock) || 0), 0);
  }
  // Quantas unidades essa linha da sacola ainda pode ter (considera as outras linhas da mesma peça quando o estoque é compartilhado).
  function maxQty(product, line) {
    if (!product) return 0;
    if (variantsOf(product).length) return stockFor(product, line.color, line.size);
    const others = readCart().filter((l) => l.product_id === product.id && !((l.size || "") === (line.size || "") && (l.color || "") === (line.color || ""))).reduce((n, l) => n + l.quantity, 0);
    return Math.max(0, (Number(product.stock) || 0) - others);
  }
  const slugify = (name) => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "peca";
  const productPath = (p) => `/produto/${p.id}-${slugify(p.name)}`;

  // ---------- Configurações públicas, análise (com consentimento) e eventos ----------
  let configPromise = null;
  function loadConfig() {
    if (!configPromise) configPromise = fetch("/api/config").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((c) => ({ pix_discount_percent: Number(c.pix_discount_percent) || 0, ga_id: c.ga_id || "", pixel_id: c.pixel_id || "" }));
    return configPromise;
  }
  const CONSENT_KEY = "krypto-consent-v1";
  const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch (_) { return null; } };
  let trackersOn = false;
  function startTrackers(cfg) {
    if (trackersOn) return; trackersOn = true;
    if (cfg.ga_id) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", cfg.ga_id);
      const s = document.createElement("script"); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga_id)}`; document.head.append(s);
    }
    if (cfg.pixel_id) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", cfg.pixel_id); window.fbq("track", "PageView");
    }
    (pendingEvents.splice(0)).forEach(([name, data]) => send(name, data));
  }
  const pendingEvents = [];
  function send(name, d) {
    const items = (d.items || []).map((i) => ({ item_id: String(i.id), item_name: i.name, price: i.price, quantity: i.quantity || 1, item_variant: i.variant || undefined }));
    if (window.gtag) {
      const map = { view_item: "view_item", add_to_cart: "add_to_cart", begin_checkout: "begin_checkout", purchase: "purchase" };
      window.gtag("event", map[name] || name, { currency: "BRL", value: d.value, transaction_id: d.transaction_id, items });
    }
    if (window.fbq) {
      const map = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" };
      if (map[name]) window.fbq("track", map[name], { currency: "BRL", value: d.value, content_type: "product", content_ids: (d.items || []).map((i) => String(i.id)), num_items: (d.items || []).reduce((n, i) => n + (i.quantity || 1), 0) });
    }
  }
  // Evento de loja: só dispara se a pessoa aceitou os cookies de análise e o painel tem os códigos configurados.
  function track(name, data) {
    if (readConsent() !== "granted") return;
    if (!trackersOn) { pendingEvents.push([name, data || {}]); return; }
    send(name, data || {});
  }
  function initConsent() {
    loadConfig().then((cfg) => {
      if (!cfg.ga_id && !cfg.pixel_id) return;
      const choice = readConsent();
      if (choice === "granted") { startTrackers(cfg); return; }
      if (choice === "denied") return;
      const bar = document.createElement("div");
      bar.className = "consent-bar"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookies e privacidade");
      const p = document.createElement("p");
      p.append("Usamos cookies de análise e publicidade para entender o uso da loja e melhorar sua experiência. Veja a ");
      const a = document.createElement("a"); a.href = "/privacidade.html"; a.textContent = "Política de Privacidade"; p.append(a, ".");
      const accept = document.createElement("button"); accept.type = "button"; accept.className = "button button-light"; accept.textContent = "Aceitar";
      const deny = document.createElement("button"); deny.type = "button"; deny.className = "button button-ghost"; deny.textContent = "Recusar";
      const decide = (value) => { try { localStorage.setItem(CONSENT_KEY, value); } catch (_) {} bar.remove(); if (value === "granted") startTrackers(cfg); };
      accept.addEventListener("click", () => decide("granted")); deny.addEventListener("click", () => decide("denied"));
      const row = document.createElement("div"); row.className = "consent-actions"; row.append(deny, accept);
      bar.append(p, row); document.body.append(bar);
    });
  }

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
document.addEventListener("DOMContentLoaded", () => { refreshBadge(); refreshAccount(); initConsent(); });

  window.Krypto = { variantsOf, stockFor, colorStock, maxQty, productPath, loadConfig, track, colorsOf, imagesFor, coverFor, lineColorOk, money, Cart, Orders, Profile, loadProducts, safeNext, goCheckout, refreshAccount };
})();
