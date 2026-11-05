// Código compartilhado da vitrine: sacola (localStorage), sessão do cliente (Supabase Auth) e cabeçalho.
(function () {
  const CART_KEY = "krypto-cart-v1";
  const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  let memoryCart = [];

  // ---------- Sacola ----------
  function validLine(l) {
    return l && Number.isSafeInteger(l.product_id) && l.product_id > 0 && Number.isInteger(l.quantity) && l.quantity > 0 && l.quantity <= 10 && typeof l.size === "string";
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
  const Cart = {
    lines: readCart,
    count: () => readCart().reduce((sum, l) => sum + l.quantity, 0),
    // Soma na linha do mesmo produto+tamanho; `max` limita ao estoque.
    add(productId, size, quantity, max) {
      const lines = readCart();
      const found = lines.find((l) => l.product_id === productId && l.size === size);
      const limit = Math.min(10, max || 10);
      if (found) found.quantity = Math.min(limit, found.quantity + quantity);
      else lines.push({ product_id: productId, size, quantity: Math.min(limit, quantity) });
      writeCart(lines);
    },
    setQuantity(productId, size, quantity) {
      const lines = readCart().map((l) => (l.product_id === productId && l.size === size ? { ...l, quantity } : l)).filter((l) => l.quantity > 0);
      writeCart(lines);
    },
    remove(productId, size) { writeCart(readCart().filter((l) => !(l.product_id === productId && l.size === size))); },
    clear() { writeCart([]); },
    replace(lines) { writeCart(lines.filter(validLine)); }
  };

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

  // ---------- Conta do cliente ----------
  let clientPromise = null;
  function auth() {
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!window.supabase || !window.supabase.createClient) return null;
        const r = await fetch("/api/auth/config", { cache: "no-store" });
        if (!r.ok) return null;
        const cfg = await r.json();
        return window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      })().catch(() => null);
    }
    return clientPromise;
  }
  async function session() {
    const client = await auth();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session : null;
  }
  const firstName = (user) => {
    const full = (user && user.user_metadata && user.user_metadata.full_name) || (user && user.email) || "";
    return String(full).split(/[\s@]/)[0];
  };
  // Só aceita destinos internos simples (ex.: checkout.html), nunca endereços externos.
  function safeNext(value, fallback) {
    return /^[a-z0-9_-]+\.html$/i.test(String(value || "")) ? value : fallback;
  }
  async function goCheckout() {
    const s = await session();
    location.assign(s ? "checkout.html" : "conta.html?next=checkout.html");
  }

  // ---------- Cabeçalho (contador da sacola e conta) ----------
  function refreshBadge() {
    const n = Cart.count();
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(n); el.hidden = n === 0; });
  }
  async function refreshAccount() {
    const s = await session();
    document.querySelectorAll("[data-account-label]").forEach((el) => {
      el.textContent = s ? `Olá, ${firstName(s.user)}` : "Entrar / Cadastrar";
    });
  }
  window.addEventListener("krypto:cart", refreshBadge);
  window.addEventListener("storage", (e) => { if (e.key === CART_KEY) refreshBadge(); });
  document.addEventListener("DOMContentLoaded", () => { refreshBadge(); refreshAccount(); });

  window.Krypto = { money, Cart, loadProducts, auth, session, firstName, safeNext, goCheckout, refreshAccount };
})();
