// Sacola lateral compartilhada (home e página de produto). Cria o próprio HTML e abre em qualquer botão #cart-open.
(function () {
  const K = window.Krypto;
  const { money, Cart, coverFor, lineColorOk, maxQty } = K;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };

  const overlay = el("div", undefined, "drawer-overlay"); overlay.id = "drawer-overlay"; overlay.hidden = true;
  const drawer = el("aside", undefined, "cart-drawer"); drawer.id = "cart-drawer"; drawer.hidden = true;
  drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-modal", "true"); drawer.setAttribute("aria-labelledby", "cart-title");
  drawer.innerHTML = `<div class="drawer-head"><h2 id="cart-title">Sua sacola <span id="drawer-count"></span></h2><button type="button" class="drawer-close" id="cart-close" aria-label="Fechar sacola">×</button></div>
    <div class="drawer-body" id="drawer-body"></div>
    <div class="drawer-foot" id="drawer-foot" hidden>
      <div class="free-shipping-progress" id="free-shipping-progress" hidden><strong></strong><span><i></i></span></div>
      <div class="drawer-subtotal"><span>Subtotal</span><strong id="drawer-subtotal">R$ 0,00</strong></div>
      <p class="drawer-note">O frete é calculado no próximo passo, de acordo com o seu estado e o peso das peças.</p>
      <button class="button button-primary drawer-buy" id="drawer-buy" type="button">Fazer compra <span aria-hidden="true">↗</span></button>
      <button class="drawer-continue" id="drawer-continue" type="button">Continuar comprando</button>
    </div>`;
  document.body.append(overlay, drawer);
  const $ = (s) => drawer.querySelector(s);
  const body = $("#drawer-body"), foot = $("#drawer-foot");
  let products = [], goal = 0, lastFocus = null;

  const load = () => Promise.all([K.loadProducts().catch(() => []), K.loadShippingInfo()]).then(([list, info]) => {
    products = list || []; goal = Number(info && info.free_over_cents || 0); if (!drawer.hidden) render();
  });
  const byId = (id) => products.find((p) => p.id === id);

  function render() {
    const lines = Cart.lines();
    body.replaceChildren();
    $("#drawer-count").textContent = lines.length ? `(${Cart.count()})` : "";
    if (!lines.length) {
      foot.hidden = true;
      const empty = el("div", undefined, "drawer-empty");
      empty.append(el("strong", "Sua sacola está vazia"), el("p", "Escolha quantas peças quiser na vitrine."));
      const go = el("button", "Ver peças", "button button-outline"); go.type = "button"; go.addEventListener("click", close);
      empty.append(go); body.append(empty);
      return;
    }
    let subtotal = 0, blocked = false;
    lines.forEach((line) => {
      const product = byId(line.product_id);
      const row = el("div", undefined, "bag-item");
      const thumb = el("div", undefined, "bag-thumb");
      if (product) thumb.style.backgroundImage = `url("${K.thumbOf(coverFor(product, line.color))}")`;
      const info = el("div", undefined, "bag-info");
      if (!product || maxQty(product, line) < 1 || !lineColorOk(product, line)) {
        blocked = true;
        info.append(el("strong", product ? product.name : "Produto indisponível"), el("small", product && !lineColorOk(product, line) ? "Esta cor não está mais disponível. Remova para continuar." : "Sem estoque. Remova para continuar.", "bag-warn"));
      } else {
        const limit = maxQty(product, line), qty = Math.min(line.quantity, limit, 10);
        subtotal += product.price_cents * qty;
        info.append(el("strong", product.name), el("small", [line.color, line.size ? `Tamanho ${line.size}` : ""].filter(Boolean).join(" · ") || product.category || ""));
        const stepper = el("div", undefined, "stepper");
        const minus = el("button", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Diminuir quantidade");
        const plus = el("button", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Aumentar quantidade");
        plus.disabled = qty >= 10 || qty >= limit;
        minus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, qty - 1, line.color));
        plus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, qty + 1, line.color));
        stepper.append(minus, el("span", String(qty)), plus);
        info.append(stepper);
        if (qty !== line.quantity) Cart.setQuantity(line.product_id, line.size, qty, line.color);
      }
      const side = el("div", undefined, "bag-side");
      if (product) side.append(el("strong", money(product.price_cents * Math.min(line.quantity, maxQty(product, line) || line.quantity))));
      const remove = el("button", "Remover", "bag-remove"); remove.type = "button";
      remove.addEventListener("click", () => Cart.remove(line.product_id, line.size, line.color));
      side.append(remove);
      row.append(thumb, info, side);
      body.append(row);
    });
    $("#drawer-subtotal").textContent = money(subtotal);
    const progress = $("#free-shipping-progress");
    if (goal > 0) {
      const remaining = Math.max(0, goal - subtotal);
      progress.hidden = false;
      progress.querySelector("strong").textContent = remaining ? `Faltam ${money(remaining)} para ganhar frete grátis` : "Você desbloqueou o frete grátis!";
      progress.querySelector("i").style.width = `${Math.min(100, subtotal / goal * 100)}%`;
    } else progress.hidden = true;
    $("#drawer-buy").disabled = blocked;
    foot.hidden = false;
  }
  function open() {
    lastFocus = document.activeElement;
    render(); drawer.hidden = false; overlay.hidden = false;
    document.body.classList.add("drawer-open");
    $("#cart-close").focus();
  }
  function close() {
    drawer.hidden = true; overlay.hidden = true;
    document.body.classList.remove("drawer-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.querySelectorAll("#cart-open").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); open(); }));
  $("#cart-close").addEventListener("click", close);
  $("#drawer-continue").addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) close(); });
  window.addEventListener("krypto:cart", () => { if (!drawer.hidden) render(); });
  $("#drawer-buy").addEventListener("click", () => K.goCheckout());
  K.openBag = open; K.closeBag = close;
  load();
})();
