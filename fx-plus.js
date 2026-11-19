// Detalhes de loja grande: foto alternativa no hover, foto "voando" para a sacola, visualização rápida,
// vistos recentemente, confete no pedido pago, transição entre páginas e cursor. Só aparência/navegação:
// nada aqui grava dados na loja (usa apenas localStorage do próprio navegador). Respeita "reduzir movimento".
(function () {
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function mk(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function K() { return window.Krypto || {}; }

  // ---------- 1) Foto alternativa ao passar o mouse nos cartões ----------
  if (fine && !reduce) {
    d.addEventListener("mouseover", function (e) {
      var g = e.target.closest && e.target.closest(".product-card .product-gallery"); if (!g || g.dataset.fxHover === "1") return;
      var track = $(".gallery-track", g); if (!track || track.children.length < 2) return;
      g.dataset.fxHover = "1";
      var t = setTimeout(function () { track.scrollTo({ left: track.clientWidth, behavior: "smooth" }); }, 180);
      g.addEventListener("mouseleave", function once() { clearTimeout(t); g.removeEventListener("mouseleave", once); g.dataset.fxHover = ""; track.scrollTo({ left: 0, behavior: "smooth" }); });
    });
  }

  // ---------- 2) Foto voando para a sacola + pulo do ícone ----------
  var lastAdd = null;
  d.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".add-to-cart, .quick-chip, .quick-chip-wide");
    if (!b) return;
    var scope = b.closest(".fx-qv-modal, .product-card, .pdp-main, body");
    var img = $(".fx-qv-modal img, .product-image img, .pdp-track img", scope) || $(".pdp-track img");
    lastAdd = { t: Date.now(), img: img };
  }, true);
  window.addEventListener("krypto:cart", function () {
    if (!lastAdd || Date.now() - lastAdd.t > 1500) return;
    var a = lastAdd; lastAdd = null;
    var target = $(".header-cart") || $("[data-cart-count]"); if (!target) return;
    function bump() { [target, $("[data-cart-count]")].forEach(function (n) { if (!n) return; n.classList.remove("fx-bump"); void n.offsetWidth; n.classList.add("fx-bump"); }); }
    if (reduce || !a.img) { bump(); return; }
    var s = a.img.getBoundingClientRect(), t = target.getBoundingClientRect(); if (!s.width) { bump(); return; }
    var fly = mk("div", "fx-fly"); fly.style.cssText = "left:" + s.left + "px;top:" + s.top + "px;width:" + s.width + "px;height:" + s.height + "px;background-image:url('" + String(a.img.currentSrc || a.img.src).replace(/['"\\]/g, "") + "')";
    d.body.appendChild(fly);
    var dx = t.left + t.width / 2 - (s.left + s.width / 2), dy = t.top + t.height / 2 - (s.top + s.height / 2);
    requestAnimationFrame(function () { fly.style.transform = "translate(" + dx + "px," + dy + "px) scale(.06)"; fly.style.opacity = ".15"; });
    setTimeout(function () { fly.remove(); bump(); }, 780);
  });

  // ---------- 3) Visualização rápida ----------
  var catalog = null;
  function products() { if (catalog) return catalog; catalog = (K().loadProducts ? Promise.resolve(K().loadProducts()) : Promise.resolve([])).then(function (l) { return Array.isArray(l) ? l : []; }).catch(function () { return []; }); return catalog; }
  function addQvButtons(scope) {
    $$(".product-card .product-image", scope).forEach(function (box) {
      if (box.dataset.fxQv) return; box.dataset.fxQv = "1";
      var b = mk("button", "fx-qv-btn"); b.type = "button"; b.setAttribute("aria-label", "Visualização rápida"); b.title = "Visualização rápida";
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
      b.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); var card = box.closest(".product-card"); var a = $("h3 a", card); openQuick(a ? a.getAttribute("href") : "", b); });
      box.appendChild(b);
    });
  }
  function openQuick(href, opener) {
    products().then(function (list) {
      var k = K(), p = list.filter(function (x) { return k.productPath && k.productPath(x) === href; })[0]; if (!p) { if (href) location.assign(href); return; }
      var ov = mk("div", "fx-qv"), box = mk("div", "fx-qv-modal"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", p.name);
      var close = mk("button", "fx-qv-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Fechar");
      var gal = mk("div", "fx-qv-gal"); (k.imagesFor ? k.imagesFor(p, "") : [p.image_url]).filter(Boolean).slice(0, 4).forEach(function (u, i) { var im = d.createElement("img"); im.src = u; im.alt = p.name + ", foto " + (i + 1); im.draggable = false; gal.appendChild(im); });
      var info = mk("div", "fx-qv-info");
      if (p.category) info.appendChild(mk("span", "eyebrow", String(p.category).toUpperCase()));
      info.appendChild(mk("h2", "", p.name));
      if (k.priceBlock) info.appendChild(k.priceBlock(p, "product-price"));
      if (p.description) info.appendChild(mk("p", "fx-qv-desc", p.description));
      if (k.purchasePanel) info.appendChild(k.purchasePanel(p, { compact: false }).root);
      var more = mk("a", "text-link", "Ver detalhes completos ↗"); more.href = href; info.appendChild(more);
      box.append(close, gal, info); ov.appendChild(box); d.body.appendChild(ov); root.classList.add("fx-noscroll");
      requestAnimationFrame(function () { ov.classList.add("is-open"); close.focus(); });
      function shut() { ov.classList.remove("is-open"); root.classList.remove("fx-noscroll"); d.removeEventListener("keydown", onKey); window.removeEventListener("krypto:cart", onCart); setTimeout(function () { ov.remove(); }, 400); if (opener && opener.focus) opener.focus(); }
      function onKey(e) { if (e.key === "Escape") shut(); }
      function onCart() { setTimeout(shut, 950); }
      d.addEventListener("keydown", onKey); window.addEventListener("krypto:cart", onCart);
      close.addEventListener("click", shut); ov.addEventListener("click", function (e) { if (e.target === ov) shut(); });
    });
  }

  // ---------- 4) Vistos recentemente ----------
  var RV = "krypto-recent-v1";
  function readRV() { try { var a = JSON.parse(localStorage.getItem(RV) || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function saveRV(item) { try { var a = readRV().filter(function (x) { return x.href !== item.href; }); a.unshift(item); localStorage.setItem(RV, JSON.stringify(a.slice(0, 8))); } catch (_) {} }
  function rvSection(items, title) {
    var s = mk("section", "fx-rv section-wrap"); s.setAttribute("aria-label", title);
    s.innerHTML = '<div class="section-heading"><div><span class="eyebrow">PARA VOCÊ</span><h2></h2></div></div><div class="fx-rv-row"></div>'; $("h2", s).textContent = title;
    var row = $(".fx-rv-row", s), k = K();
    items.forEach(function (it) {
      var a = mk("a", "fx-rv-card"); a.href = it.href;
      var im = d.createElement("img"); im.src = it.img; im.alt = it.name; im.loading = "lazy"; im.decoding = "async";
      var n = mk("strong", "", it.name), pr = mk("span", "", it.price != null && k.money ? k.money(it.price) : "");
      a.append(im, n, pr); row.appendChild(a);
    });
    return s;
  }
  function initRecent() {
    var node = $("#product-data");
    if (node) { // página da peça: guarda e mostra as outras vistas
      try {
        var p = JSON.parse(node.textContent), k = K(); if (!k.productPath) return;
        var href = k.productPath(p), me = { href: href, name: p.name, img: (k.coverFor ? k.coverFor(p, "") : p.image_url) || p.image_url, price: p.price_cents };
        saveRV(me);
        var others = readRV().filter(function (x) { return x.href !== href; }).slice(0, 4);
        var main = $("main"); if (others.length && main) main.appendChild(rvSection(others, "Vistos recentemente"));
      } catch (_) {}
    } else if ($(".hero")) { // home
      var items = readRV().slice(0, 6), anchor = $("#sobre") || $(".manifesto");
      if (items.length && anchor) anchor.parentNode.insertBefore(rvSection(items, "Vistos recentemente"), anchor);
    }
  }

  // ---------- 5) Confete quando o pagamento está aprovado ----------
  function confetti() {
    if (reduce) return;
    var colors = ["#a855f7", "#c08bff", "#ffffff", "#f5be5a", "#7d2fd1"], wrap = mk("div", "fx-confetti"); wrap.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 70; i++) {
      var c = mk("i"); c.style.cssText = "left:" + (Math.random() * 100) + "%;background:" + colors[i % colors.length] + ";--dx:" + ((Math.random() - .5) * 220) + "px;--r:" + (Math.random() * 720 - 360) + "deg;animation-delay:" + (Math.random() * .5) + "s;animation-duration:" + (1.8 + Math.random() * 1.4) + "s;width:" + (6 + Math.random() * 6) + "px;height:" + (10 + Math.random() * 8) + "px";
      wrap.appendChild(c);
    }
    d.body.appendChild(wrap); setTimeout(function () { wrap.remove(); }, 4200);
  }
  function initConfetti() {
    var pay = $("#payment-status"), code = $("#order-code"); if (!pay || !code) return;
    function check() { var id = (code.textContent || "").trim(); if (!id || !/Aprovado/i.test(pay.textContent || "")) return; var key = "krypto-fx-confetti-" + id; try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch (_) { return; } confetti(); }
    new MutationObserver(check).observe(pay, { childList: true, characterData: true, subtree: true }); check();
  }

  // ---------- 6) Transição entre páginas ----------
  if (!reduce) {
    try { if (sessionStorage.getItem("krypto-fx-nav") === "1") { sessionStorage.removeItem("krypto-fx-nav"); root.classList.add("fx-page-in"); } } catch (_) {}
    d.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href]"); if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      var u; try { u = new URL(a.href, location.href); } catch (_) { return; }
      if (u.origin !== location.origin || /^\/(api|admin)/.test(u.pathname) || /admin\.html/.test(u.pathname)) return;
      if (u.pathname === location.pathname && u.search === location.search) return;
      e.preventDefault();
      var wipe = mk("div", "fx-wipe"); wipe.setAttribute("aria-hidden", "true"); d.body.appendChild(wipe);
      requestAnimationFrame(function () { wipe.classList.add("is-on"); });
      try { sessionStorage.setItem("krypto-fx-nav", "1"); } catch (_) {}
      setTimeout(function () { location.assign(u.href); }, 380);
    });
    window.addEventListener("pageshow", function (ev) { if (ev.persisted) $$(".fx-wipe").forEach(function (n) { n.remove(); }); });
  }

  // ---------- 7) Cursor em anel (só mouse) ----------
  if (fine && !reduce) {
    var ring = mk("div", "fx-cursor"), lab = mk("span"); ring.appendChild(lab); ring.setAttribute("aria-hidden", "true");
    var x = -100, y = -100, rx = x, ry = y, shown = false;
    function loop() { rx += (x - rx) * .2; ry += (y - ry) * .2; ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)"; requestAnimationFrame(loop); }
    d.addEventListener("mousemove", function (e) {
      x = e.clientX; y = e.clientY; if (!shown) { shown = true; d.body.appendChild(ring); requestAnimationFrame(loop); }
      var t = e.target, state = "", text = "";
      if (t.closest) {
        if (t.closest(".product-gallery .gallery-track")) { state = "is-view"; text = "VER"; }
        else if (t.closest("a, button, summary, select, label, .swatch, input")) state = "is-hot";
      }
      ring.className = "fx-cursor" + (state ? " " + state : ""); lab.textContent = text;
    }, { passive: true });
    d.addEventListener("mouseleave", function () { ring.style.opacity = "0"; }); d.addEventListener("mouseenter", function () { ring.style.opacity = ""; });
  }

  function init() {
    addQvButtons(d);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && (n.matches && n.matches(".product-card") || n.querySelector && n.querySelector(".product-card"))) addQvButtons(n.parentNode || d); }); }); }).observe(d.body, { childList: true, subtree: true });
    initRecent(); initConfetti();
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
