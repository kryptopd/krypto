// Liga a camada de emoção/animação (homolog-fx.css/js) só quando o modo homologação está ligado neste navegador.
// É só aparência: quem confirma a conta de desenvolvedor e bloqueia gravações é o servidor; shop.js desfaz tudo se não for.
(function () {
  try {
    if (localStorage.getItem("krypto-homolog-ui") !== "1") return;
    var d = document, root = d.documentElement;
    root.classList.add("homolog-fx");
    var l = d.createElement("link"); l.rel = "stylesheet"; l.href = "/homolog-fx.css"; l.id = "homolog-fx-css"; d.head.appendChild(l);
    var s = d.createElement("script"); s.src = "/homolog-fx.js"; s.id = "homolog-fx-js"; s.defer = true; d.head.appendChild(s);
  } catch (_) {}
})();
