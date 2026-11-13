// Painel de compra compartilhado (cartão da vitrine e página do produto): cor, tamanho, estoque por variação,
// adicionar à sacola e "avise-me quando chegar". Depende de shop.js (window.Krypto).
(function () {
  const K = window.Krypto;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };

  // Aviso rápido; com `action` mostra um botão (ex.: "Ver sacola").
  function toast(message, action) {
    const box = document.querySelector("#toast");
    if (!box) return;
    box.replaceChildren(document.createTextNode(message));
    if (action) {
      const b = el("button", action.label, "toast-action"); b.type = "button";
      b.addEventListener("click", () => { box.hidden = true; action.onClick(); });
      box.append(b);
    }
    box.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { box.hidden = true; }, action ? 4200 : 2600);
  }
  K.toast = toast;

  const openBag = () => { const open = document.querySelector("#cart-open"); if (open) open.click(); else location.assign("/checkout.html"); };

  // Coloca 1 unidade na sacola respeitando o estoque da variação. Devolve true se adicionou.
  function addToBag(product, color, size) {
    const { Cart, maxQty, track } = K;
    const line = { product_id: product.id, size, color };
    const existing = (Cart.lines().find((l) => l.product_id === product.id && l.size === size && (l.color || "") === color) || {}).quantity || 0;
    const room = maxQty(product, line) - existing;
    if (room <= 0) { toast("Você já tem todo o estoque disponível dessa opção na sacola."); return false; }
    Cart.add(product.id, size, 1, existing + room, color);
    track("add_to_cart", { value: product.price_cents / 100, items: [{ id: product.id, name: product.name, price: product.price_cents / 100, quantity: 1, variant: [color, size].filter(Boolean).join(" / ") }] });
    toast(`${product.name}${[color, size].filter(Boolean).length ? ` (${[color, size].filter(Boolean).join(", ")})` : ""} foi para a sacola.`, { label: "Ver sacola", onClick: openBag });
    return true;
  }

  // Adição rápida sobre a foto do card: um toque no tamanho já coloca na sacola.
  // getColor() devolve a cor escolhida no momento. Devolve { root, refresh }.
  function quickAdd(product, getColor) {
    const { stockFor } = K;
    const root = el("div", undefined, "quick-add");
    if (Number(product.stock) < 1) {
      const a = el("a", "Esgotado · Avise-me", "quick-add-oos"); a.href = K.productPath(product);
      root.append(a);
      return { root, refresh() {} };
    }
    const nodes = [];
    const done = (btn) => { btn.classList.add("is-done"); setTimeout(() => btn.classList.remove("is-done"), 1400); };
    if (product.sizes.length) {
      root.append(el("span", "Adicionar rápido", "quick-add-label"));
      const row = el("div", undefined, "quick-add-sizes");
      row.setAttribute("role", "group"); row.setAttribute("aria-label", `Adicionar ${product.name} à sacola`);
      product.sizes.forEach((size) => {
        const b = el("button", size, "quick-chip"); b.type = "button"; b.dataset.size = size;
        b.addEventListener("click", () => {
          if (stockFor(product, getColor(), size) < 1) { toast(`Tamanho ${size} esgotado${getColor() ? ` em ${getColor()}` : ""}. Abra a peça para ser avisado quando voltar.`); return; }
          if (addToBag(product, getColor(), size)) done(b);
        });
        nodes.push(b); row.append(b);
      });
      root.append(row);
    } else {
      const b = el("button", "+ Adicionar à sacola", "quick-chip quick-chip-wide"); b.type = "button";
      b.addEventListener("click", () => {
        if (stockFor(product, getColor(), "") < 1) { toast(`Esgotado${getColor() ? ` em ${getColor()}` : ""}.`); return; }
        if (addToBag(product, getColor(), "")) done(b);
      });
      nodes.push(b); root.append(b);
    }
    const refresh = () => nodes.forEach((n) => n.classList.toggle("is-sold", stockFor(product, getColor(), n.dataset.size || "") < 1));
    refresh();
    return { root, refresh };
  }

  // opts: { onColor(colorName), onAdded() }
  function purchasePanel(product, opts = {}) {
    const { Cart, colorsOf, stockFor, colorStock, maxQty, track, money } = K;
    const colors = colorsOf(product);
    let color = colors.length ? colors[0].name : "";
    let size = product.sizes.length === 1 ? product.sizes[0] : "";
    const root = el("div", undefined, "purchase");

    // ----- Cor
    let colorLabel = null, swatchNodes = [];
    if (colors.length) {
      const box = el("div", undefined, "color-picker");
      colorLabel = el("span", undefined, "color-label");
      const group = el("div", undefined, "swatches");
      group.setAttribute("role", "group"); group.setAttribute("aria-label", `Cor de ${product.name}`);
      colors.forEach((c) => {
        const dot = el("button", undefined, "swatch");
        dot.type = "button"; dot.style.setProperty("--swatch", c.hex); dot.dataset.color = c.name;
        dot.addEventListener("click", () => {
          if (color === c.name) return;
          color = c.name; message.textContent = ""; delete message.dataset.error;
          refresh(); if (opts.onColor) opts.onColor(color);
        });
        swatchNodes.push(dot); group.append(dot);
      });
      box.append(colorLabel, group); root.append(box);
    }

    // ----- Tamanho (no cartão da vitrine a escolha é feita na adição rápida sobre a foto)
    let chipNodes = [];
    if (product.sizes.length && !opts.compact) {
      const wrap = el("div", undefined, "size-picker");
      wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", `Tamanho de ${product.name}`);
      product.sizes.forEach((s) => {
        const chip = el("button", s, "size-chip");
        chip.type = "button"; chip.dataset.size = s;
        chip.addEventListener("click", () => { size = s; message.textContent = ""; delete message.dataset.error; refresh(); });
        chipNodes.push(chip); wrap.append(chip);
      });
      root.append(wrap);
    }

    const hint = el("p", "", "stock-hint");
    const message = el("p", "", "product-msg"); message.setAttribute("role", "status");
    const action = el("button", "Adicionar à sacola", "button button-primary add-to-cart"); action.type = "button";

    // ----- Avise-me
    const alertForm = el("form", undefined, "stock-alert"); alertForm.hidden = true; alertForm.noValidate = true;
    const email = el("input"); email.type = "email"; email.placeholder = "Seu e-mail"; email.autocomplete = "email"; email.setAttribute("aria-label", "Seu e-mail para o aviso"); email.required = true;
    const trap = el("input"); trap.name = "website"; trap.tabIndex = -1; trap.autocomplete = "off"; trap.className = "honeypot"; trap.setAttribute("aria-hidden", "true");
    const send = el("button", "Avisar-me", "button button-light"); send.type = "submit";
    const alertNote = el("small", "Enviaremos um aviso quando essa opção voltar ao estoque.", "stock-alert-note");
    alertForm.append(email, trap, send, alertNote);
    alertForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { alertNote.textContent = "Informe um e-mail válido."; alertNote.dataset.error = "true"; return; }
      send.disabled = true; alertNote.textContent = "Salvando…"; delete alertNote.dataset.error;
      try {
        const r = await fetch("/api/stock-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id, email: email.value.trim(), color, size, website: trap.value }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || "Não foi possível salvar agora.");
        alertNote.textContent = j.message || "Pronto! Avisaremos quando a peça voltar.";
        email.value = ""; email.disabled = true; send.disabled = true;
      } catch (error) { alertNote.textContent = error.message; alertNote.dataset.error = "true"; send.disabled = false; }
    });

    // Sem estoque na opção escolhida? (com tamanhos e nenhum escolhido, só vale quando a cor inteira acabou)
    const isOut = () => {
      if (product.sizes.length) return size ? stockFor(product, color, size) < 1 : colorStock(product, color) < 1;
      return stockFor(product, color, "") < 1;
    };

    function refresh() {
      if (colorLabel) { colorLabel.replaceChildren(el("em", "Cor: "), document.createTextNode(color)); }
      swatchNodes.forEach((n) => {
        const sold = colorStock(product, n.dataset.color) < 1;
        n.setAttribute("aria-pressed", String(n.dataset.color === color));
        n.classList.toggle("swatch-sold", sold);
        n.title = sold ? `${n.dataset.color} (esgotado)` : n.dataset.color;
        n.setAttribute("aria-label", n.title);
      });
      chipNodes.forEach((n) => {
        const sold = stockFor(product, color, n.dataset.size) < 1;
        n.setAttribute("aria-pressed", String(n.dataset.size === size));
        n.classList.toggle("size-chip-sold", sold);
        n.setAttribute("aria-label", sold ? `${n.dataset.size} (esgotado)` : n.dataset.size);
      });
      const out = isOut();
      const units = product.sizes.length ? (size ? stockFor(product, color, size) : 0) : stockFor(product, color, "");
      hint.textContent = !out && units > 0 && units <= 3 ? `Restam só ${units} ${units === 1 ? "unidade" : "unidades"}` : "";
      action.textContent = out ? "Avise-me quando chegar" : "Adicionar à sacola";
      action.classList.toggle("is-alert", out);
      if (!out) alertForm.hidden = true;
    }

    action.addEventListener("click", () => {
      if (isOut()) { alertForm.hidden = !alertForm.hidden; if (!alertForm.hidden) email.focus(); return; }
      if (product.sizes.length && !size) { message.textContent = "Escolha um tamanho."; message.dataset.error = "true"; return; }
      message.textContent = ""; delete message.dataset.error;
      if (addToBag(product, color, size) && opts.onAdded) opts.onAdded();
    });

    if (!opts.compact) root.append(hint, message, action, alertForm);
    refresh();
    return { root, color: () => color, size: () => size };
  }

  // Cartão compacto (carrossel de lançamentos, "peças parecidas"): foto, nome, preço e, se houver, preço no PIX.
  function miniCard(product, pixPercent) {
    const a = el("a", undefined, "mini-card"); a.href = K.productPath(product);
    const img = el("div", undefined, "mini-img");
    img.style.backgroundImage = `url("${String(K.thumbOf(K.coverFor(product, (K.colorsOf(product)[0] || {}).name))).replace(/["\\]/g, "")}")`;
    if (Number(product.stock) < 1) img.append(el("span", "ESGOTADO", "product-tag product-tag-sold"));
    else if (Number(product.stock) <= 3) img.append(el("span", "ÚLTIMAS UNIDADES", "product-tag product-tag-low"));
    a.append(img, el("strong", product.name), K.priceBlock(product, "mini-price"));
    if (pixPercent > 0) a.append(el("small", `${money(Math.round(product.price_cents * (1 - pixPercent / 100)))} no PIX`, "product-pix"));
    const colors = K.colorsOf(product);
    if (colors.length > 1) { const dots = el("span", undefined, "mini-dots"); colors.slice(0, 6).forEach((c) => { const d = el("i"); d.style.background = c.hex; d.title = c.name; dots.append(d); }); a.append(dots); }
    return a;
  }
  const money = (c) => K.money(c);

  K.purchasePanel = purchasePanel;
  K.miniCard = miniCard;
  K.quickAdd = quickAdd;
  K.addToBag = addToBag;
})();
