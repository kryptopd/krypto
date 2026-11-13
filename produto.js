// Página de produto: galeria com deslizar e zoom, painel de compra, barra de compra fixa no celular,
// preço no PIX e peças parecidas. O HTML base vem do servidor (SEO).
(() => {
  const K = window.Krypto;
  const node = document.getElementById("product-data");
  if (!node || !K || !K.purchasePanel) return;
  const product = JSON.parse(node.textContent);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };
  const box = document.getElementById("pdp-gallery");
  const safeUrl = (u) => String(u).replace(/["\\]/g, "");

  // ---------- Galeria: faixa com encaixe (deslizar no celular), miniaturas, bolinhas e zoom ----------
  let urls = [];
  function renderGallery(colorName) {
    urls = K.imagesFor(product, colorName);
    box.replaceChildren();
    const stage = el("div", undefined, "pdp-stage");
    const track = el("div", undefined, "pdp-track");
    track.setAttribute("aria-label", `Fotos de ${product.name}`);
    if (urls.length > 1) { track.tabIndex = 0; track.setAttribute("role", "group"); }
    urls.forEach((url, i) => {
      const img = document.createElement("img");
      img.src = url; img.decoding = "async"; img.draggable = false; img.loading = i ? "lazy" : "eager";
      img.alt = urls.length > 1 ? `${product.name}${colorName ? `, ${colorName}` : ""}, foto ${i + 1} de ${urls.length}` : product.name;
      img.addEventListener("click", () => openZoom(i));
      track.append(img);
    });
    stage.append(track);
    const hint = el("span", "Toque para ampliar", "pdp-zoom-hint"); stage.append(hint);
    const dots = el("div", undefined, "gallery-dots pdp-dots");
    const dotNodes = urls.map(() => { const d = el("span"); dots.append(d); return d; });
    if (urls.length > 1) stage.append(dots);
    const thumbs = el("div", undefined, "pdp-thumbs");
    const indexNow = () => Math.max(0, Math.min(urls.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
    const sync = () => {
      const i = indexNow();
      dotNodes.forEach((d, n) => d.classList.toggle("on", n === i));
      thumbs.querySelectorAll("button").forEach((b, n) => b.setAttribute("aria-pressed", String(n === i)));
    };
    urls.forEach((url, i) => {
      const b = el("button", undefined, "pdp-thumb"); b.type = "button"; b.setAttribute("aria-label", `Ver foto ${i + 1}`);
      b.style.backgroundImage = `url("${safeUrl(url)}")`;
      b.addEventListener("click", () => track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" }));
      thumbs.append(b);
    });
    track.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });
    box.append(stage);
    if (urls.length > 1) box.append(thumbs);
    sync();
  }

  // Ampliação: tela cheia, setas, Esc e toque para aproximar.
  function openZoom(start) {
    let i = start, zoomed = false;
    const layer = el("div", undefined, "zoom-layer"); layer.setAttribute("role", "dialog"); layer.setAttribute("aria-modal", "true"); layer.setAttribute("aria-label", "Foto ampliada");
    const img = document.createElement("img"); img.className = "zoom-img"; img.alt = product.name;
    const close = el("button", "×", "zoom-close"); close.type = "button"; close.setAttribute("aria-label", "Fechar");
    const prev = el("button", "‹", "zoom-nav zoom-prev"), next = el("button", "›", "zoom-nav zoom-next");
    prev.type = next.type = "button"; prev.setAttribute("aria-label", "Foto anterior"); next.setAttribute("aria-label", "Próxima foto");
    const show = (n) => { i = (n + urls.length) % urls.length; img.src = urls[i]; zoomed = false; img.classList.remove("zoomed"); img.style.transformOrigin = ""; };
    const last = document.activeElement;
    const shut = () => { document.removeEventListener("keydown", onKey); layer.remove(); document.body.classList.remove("drawer-open"); if (last && last.focus) last.focus(); };
    const onKey = (e) => { if (e.key === "Escape") shut(); else if (e.key === "ArrowLeft") show(i - 1); else if (e.key === "ArrowRight") show(i + 1); };
    img.addEventListener("click", (e) => {
      zoomed = !zoomed; img.classList.toggle("zoomed", zoomed);
      const r = img.getBoundingClientRect();
      img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    });
    close.addEventListener("click", shut); prev.addEventListener("click", () => show(i - 1)); next.addEventListener("click", () => show(i + 1));
    layer.addEventListener("click", (e) => { if (e.target === layer) shut(); });
    layer.append(img, close); if (urls.length > 1) layer.append(prev, next);
    document.body.append(layer); document.body.classList.add("drawer-open"); document.addEventListener("keydown", onKey);
    show(start); close.focus();
  }

  const initial = K.colorsOf(product)[0];
  renderGallery(initial ? initial.name : "");
  const panel = K.purchasePanel(product, { onColor: (name) => renderGallery(name) });
  document.getElementById("pdp-purchase").append(panel.root);

  // ---------- Barra de compra fixa (celular): aparece quando o botão principal sai da tela ----------
  const mainButton = panel.root.querySelector(".add-to-cart");
  if (mainButton && "IntersectionObserver" in window) {
    const bar = el("div", undefined, "pdp-sticky"); bar.hidden = true;
    const info = el("div"); info.append(el("strong", product.name), el("span", K.money(product.price_cents)));
    const btn = el("button", "Adicionar à sacola", "button button-light"); btn.type = "button";
    btn.addEventListener("click", () => {
      mainButton.click();
      const err = panel.root.querySelector(".product-msg[data-error]");
      const form = panel.root.querySelector(".stock-alert:not([hidden])");
      if (err || form) panel.root.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    bar.append(info, btn); document.body.append(bar);
    const sync = () => { btn.textContent = mainButton.textContent; };
    new MutationObserver(sync).observe(mainButton, { childList: true, characterData: true, subtree: true }); sync();
    new IntersectionObserver(([entry]) => { const show = !entry.isIntersecting && entry.boundingClientRect.top < 0; bar.hidden = !show; document.body.classList.toggle("has-sticky", show); }, { threshold: 0 }).observe(mainButton);
  }

  // ---------- Preço no PIX + peças parecidas ----------
  K.loadConfig().then((cfg) => {
    const pct = cfg.pix_discount_percent;
    if (pct > 0) {
      const price = Math.round(product.price_cents * (1 - pct / 100));
      const p = document.getElementById("pdp-pix");
      p.replaceChildren(el("strong", K.money(price)), document.createTextNode(` no PIX · ${String(pct).replace(".", ",")}% de desconto`));
      p.hidden = false;
    }
    return K.loadProducts().then((all) => {
      const others = (all || []).filter((p) => p.id !== product.id);
      const same = others.filter((p) => p.category && p.category === product.category);
      const rest = others.filter((p) => !same.includes(p));
      const picks = [...same, ...rest].slice(0, 4);
      if (!picks.length) return;
      const section = el("section", undefined, "pdp-related"); section.setAttribute("aria-labelledby", "rel-title");
      const head = el("div", undefined, "section-heading"); const hd = el("div");
      hd.append(el("span", "CONTINUE EXPLORANDO", "eyebrow")); const h = el("h2", "Você também pode gostar"); h.id = "rel-title"; hd.append(h); head.append(hd);
      const grid = el("div", undefined, "mini-grid");
      picks.forEach((p) => grid.append(K.miniCard(p, pct)));
      section.append(head, grid);
      document.querySelector(".pdp-reviews").before(section);
    });
  }).catch(() => {});

  K.track("view_item", { value: product.price_cents / 100, items: [{ id: product.id, name: product.name, price: product.price_cents / 100 }] });
})();
