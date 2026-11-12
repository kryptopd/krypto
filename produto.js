// Página de produto: galeria por cor, painel de compra e preço no PIX. O HTML base vem do servidor (SEO).
(() => {
  const K = window.Krypto;
  const node = document.getElementById("product-data");
  if (!node || !K || !K.purchasePanel) return;
  const product = JSON.parse(node.textContent);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };
  const box = document.getElementById("pdp-gallery");

  function renderGallery(colorName) {
    const urls = K.imagesFor(product, colorName);
    box.replaceChildren();
    const stage = el("div", undefined, "pdp-stage");
    const main = document.createElement("img");
    main.alt = product.name; main.decoding = "async";
    stage.append(main);
    const thumbs = el("div", undefined, "pdp-thumbs");
    const select = (i) => {
      main.src = urls[i];
      main.alt = urls.length > 1 ? `${product.name}${colorName ? `, ${colorName}` : ""}, foto ${i + 1} de ${urls.length}` : product.name;
      thumbs.querySelectorAll("button").forEach((b, n) => b.setAttribute("aria-pressed", String(n === i)));
    };
    urls.forEach((url, i) => {
      const b = el("button", undefined, "pdp-thumb"); b.type = "button"; b.setAttribute("aria-label", `Ver foto ${i + 1}`);
      b.style.backgroundImage = `url("${url.replace(/["\\]/g, "")}")`;
      b.addEventListener("click", () => select(i));
      thumbs.append(b);
    });
    box.append(stage);
    if (urls.length > 1) box.append(thumbs);
    select(0);
  }

  const initial = K.colorsOf(product)[0];
  renderGallery(initial ? initial.name : "");
  const panel = K.purchasePanel(product, { onColor: (name) => renderGallery(name) });
  document.getElementById("pdp-purchase").append(panel.root);

  K.loadConfig().then((cfg) => {
    if (cfg.pix_discount_percent > 0) {
      const price = Math.round(product.price_cents * (1 - cfg.pix_discount_percent / 100));
      const p = document.getElementById("pdp-pix");
      p.textContent = `${K.money(price)} no PIX (${String(cfg.pix_discount_percent).replace(".", ",")}% de desconto)`;
      p.hidden = false;
    }
  });
  K.track("view_item", { value: product.price_cents / 100, items: [{ id: product.id, name: product.name, price: product.price_cents / 100 }] });
})();
