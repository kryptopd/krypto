// Animações do modo homologação (só aparência; nada aqui grava dados). Carregado por homolog-theme.js.
(function () {
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function go() { root.classList.remove("fx-locked"); root.classList.add("fx-go"); }

  // 1) Abertura (uma vez por sessão, só na home)
  var home = !!$(".hero");
  var seen = false; try { seen = sessionStorage.getItem("krypto-fx-intro") === "1"; } catch (_) {}
  if (home && !seen && !reduce) {
    var intro = d.createElement("div"); intro.className = "fx-intro"; intro.setAttribute("aria-hidden", "true");
    var letters = "KRYPTO".split("").map(function (c, i) { return '<span style="--i:' + i + '">' + c + "</span>"; }).join("");
    intro.innerHTML = '<div class="fx-intro-mark"><svg viewBox="0 0 38 32"><path d="M3 26 6 8l8 8 5-12 5 12 8-8 3 18Z"/></svg>' + letters + '</div><div class="fx-intro-bar"></div>';
    root.classList.add("fx-locked"); d.body ? d.body.appendChild(intro) : d.addEventListener("DOMContentLoaded", function () { d.body.appendChild(intro); });
    setTimeout(function () { intro.classList.add("is-out"); go(); }, 2200);
    setTimeout(function () { intro.remove(); }, 3600);
    try { sessionStorage.setItem("krypto-fx-intro", "1"); } catch (_) {}
  } else { go(); }

  function init() {
    // 2) Barra de progresso + cabeçalho
    var bar = d.createElement("div"); bar.className = "fx-progress"; d.body.appendChild(bar);
    var header = $(".store-header"), ticking = false, hero = $(".hero"), heroImg = $("#hero-image");
    function onScroll() {
      var y = window.scrollY, max = Math.max(1, d.documentElement.scrollHeight - innerHeight);
      bar.style.setProperty("--p", Math.min(1, y / max).toFixed(4));
      if (header) header.classList.toggle("is-scrolled", y > 40);
      if (heroImg && !reduce && y < innerHeight * 1.2) heroImg.style.setProperty("--fx-py", (y * .12).toFixed(1) + "px");
      ticking = false;
    }
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    if (hero) {
      // 3) Título em linhas com máscara (mantém #hero-rotating-word para o shop/hero-motion)
      var h1 = $("h1", hero);
      if (h1 && !h1.dataset.fx) {
        h1.dataset.fx = "1";
        var word = $("#hero-rotating-word", h1), first = h1.firstChild;
        if (first && first.nodeType === 3 && word) {
          var m1 = d.createElement("span"), s1 = d.createElement("span"), m2 = d.createElement("span");
          m1.className = m2.className = "fx-mask"; s1.textContent = first.textContent.trim();
          m1.appendChild(s1); m2.appendChild(word);
          while (h1.firstChild) h1.removeChild(h1.firstChild);
          h1.appendChild(m1); h1.appendChild(m2);
        }
      }
      // 4) brilho que segue o mouse + botões magnéticos + indicador
      var glow = d.createElement("div"); glow.className = "hero-glow"; hero.appendChild(glow);
      var sc = d.createElement("div"); sc.className = "fx-scroll"; sc.setAttribute("aria-hidden", "true"); sc.innerHTML = "<i></i>ROLE"; hero.appendChild(sc);
      if (fine && !reduce) {
        hero.addEventListener("mousemove", function (e) { var r = hero.getBoundingClientRect(); glow.style.setProperty("--gx", (e.clientX - r.left) + "px"); glow.style.setProperty("--gy", (e.clientY - r.top) + "px"); });
        $$(".hero-actions .button", hero).forEach(function (b) {
          b.addEventListener("mousemove", function (e) { var r = b.getBoundingClientRect(); b.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * .18).toFixed(1) + "px," + ((e.clientY - r.top - r.height / 2) * .28).toFixed(1) + "px)"; });
          b.addEventListener("mouseleave", function () { b.style.transform = ""; });
        });
      }
      // 5) faixa em movimento
      var items = ["Vista sua atitude", "Peças em quantidade limitada", "Entrega para todo o Brasil", "Nova coleção 2026"];
      var once = items.map(function (t) { return "<span>" + t + "</span>"; }).join("");
      var mq = d.createElement("div"); mq.className = "fx-marquee"; mq.setAttribute("aria-hidden", "true");
      mq.innerHTML = '<div class="fx-marquee-track">' + once + once + once + once + "</div>";
      hero.insertAdjacentElement("afterend", mq);
    }

    // 6) Revelar ao rolar (inclui cartões que chegam depois, via API)
    var SEL = ".section-heading, .product-card, .benefits > div, .cat-tiles > *, .review-card, .manifesto-copy, .newsletter-band, .shop-cta, .footer-col, .carousel-btn";
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("fx-in"); io.unobserve(e.target); } }); }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    function mark(scope) {
      $$(SEL, scope).forEach(function (el) {
        if (el.dataset.fx) return; el.dataset.fx = "1";
        var sibs = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        el.style.setProperty("--fx-i", String(Math.min(sibs, 3)));
        el.classList.add("fx-reveal"); io.observe(el);
      });
    }
    mark(d);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches(SEL)) mark(n.parentNode); mark(n); } }); }); }).observe(d.body, { childList: true, subtree: true });
    setTimeout(function () { $$(".fx-reveal:not(.fx-in)").forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add("fx-in"); }); }, 2600);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
