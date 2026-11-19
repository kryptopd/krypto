// Liga o tema visual de homologação (theme-campos.css) só quando o modo homologação está ligado neste navegador.
// É só aparência: quem bloqueia as gravações é o servidor. shop.js desfaz o tema se a conta não for de desenvolvedor.
(function () {
  try {
    if (localStorage.getItem("krypto-homolog-ui") !== "1") return;
    document.documentElement.classList.add("homolog-theme");
    var link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "/theme-campos.css"; link.id = "homolog-theme-css";
    document.head.appendChild(link);
  } catch (_) {}
})();
