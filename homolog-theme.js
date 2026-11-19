// Camada de emoção/animação da loja (homolog-fx.css/js): carregada para todos os visitantes.
// É só aparência; respeita "reduzir movimento" do sistema. Nada aqui grava dados.
(function () {
  try {
    var d = document, root = d.documentElement;
    root.classList.add("homolog-fx");
    var l = d.createElement("link"); l.rel = "stylesheet"; l.href = "/homolog-fx.css"; l.id = "homolog-fx-css"; d.head.appendChild(l);
    var s = d.createElement("script"); s.src = "/homolog-fx.js"; s.id = "homolog-fx-js"; s.defer = true; d.head.appendChild(s);
    var l2 = d.createElement("link"); l2.rel = "stylesheet"; l2.href = "/fx-plus.css"; d.head.appendChild(l2);
    var s2 = d.createElement("script"); s2.src = "/fx-plus.js"; s2.defer = true; d.head.appendChild(s2);
  } catch (_) {}
})();
