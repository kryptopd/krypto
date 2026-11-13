const K = window.Krypto;
const $ = (s) => document.querySelector(s);
const listBox = $("#orders-list"), emptyBox = $("#orders-empty");
const labels = { aguardando: "Aguardando pagamento", aguardando_pagamento: "Aguardando pagamento", confirmado: "Pagamento confirmado", preparando: "Em preparação", enviado: "A caminho", entregue: "Entregue", cancelado: "Cancelado", expirado: "Expirado" };
// Texto curto e cor do selo para cada fase (em andamento, a caminho, finalizado...).
const phase = (o) => {
  if (["cancelado", "expirado"].includes(o.status)) return "bad";
  if (o.status === "entregue") return "done";
  if (o.status === "enviado") return "ship";
  if (["aguardando", "aguardando_pagamento"].includes(o.status)) return "wait";
  return "work";
};
const group = (o) => (["entregue", "cancelado", "expirado"].includes(o.status) ? "done" : "open");
const stepIndex = { aguardando: 0, aguardando_pagamento: 0, confirmado: 1, preparando: 2, enviado: 3, entregue: 4 };
const steps = ["Pedido", "Pago", "Preparando", "A caminho", "Entregue"];
const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; };
function note(node, message, isError) { node.textContent = message; if (isError) node.dataset.error = "true"; else delete node.dataset.error; }

let orders = [], timer = null;

function card(o) {
  const article = el("article", undefined, `order-card phase-${phase(o)}`);
  const head = el("div", undefined, "order-card-head");
  const title = el("div");
  title.append(el("strong", `Pedido #${o.public_id}`), el("small", o.created_at ? new Date(o.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""));
  head.append(title, el("span", labels[o.status] || o.status, `order-badge phase-${phase(o)}`));
  article.append(head);

  const names = (o.items || []).map((i) => `${i.quantity}× ${i.name}${i.color ? ` · ${i.color}` : ""}${i.size ? ` (${i.size})` : ""}`);
  if (names.length) article.append(el("p", names.join(" · "), "order-card-items"));

  if (o.status in stepIndex) {
    const bar = el("ol", undefined, "order-mini-steps");
    steps.forEach((label, i) => { const li = el("li", label); if (i <= stepIndex[o.status]) li.className = i === stepIndex[o.status] ? "done current" : "done"; bar.append(li); });
    article.append(bar);
  }
  const foot = el("div", undefined, "order-card-foot");
  foot.append(el("strong", K.money(o.total_cents)));
  if (o.tracking_code) foot.append(el("small", `${o.shipping_provider || "Rastreio"}: ${o.tracking_code}`, "order-track"));
  article.append(foot);

  const actions = el("div", undefined, "order-card-actions");
  const open = el("a", o.pix_payload ? "Pagar com PIX" : "Ver detalhes", o.pix_payload ? "button button-primary" : "button button-outline");
  open.href = `pedido.html?order=${encodeURIComponent(o.public_id)}`;
  actions.append(open);
  if (o.status === "entregue") {
    const rate = el("a", "Avaliar peças", "button button-outline");
    rate.href = `avaliacoes.html?pedido=${encodeURIComponent(o.public_id)}`;
    actions.append(rate);
  }
  const hide = el("button", "Remover da lista", "link-button"); hide.type = "button";
  hide.addEventListener("click", () => { K.Orders.remove(o.public_id); orders = orders.filter((x) => x.public_id !== o.public_id); render(); K.refreshAccount(); });
  actions.append(hide);
  article.append(actions);
  return article;
}

function section(title, list) {
  const wrap = el("div", undefined, "orders-group");
  wrap.append(el("h2", `${title} (${list.length})`));
  list.forEach((o) => wrap.append(card(o)));
  return wrap;
}

function render() {
  listBox.replaceChildren();
  emptyBox.hidden = orders.length > 0;
  if (!orders.length) { $("#orders-recover").open = true; return; }
  const open = orders.filter((o) => group(o) === "open"), done = orders.filter((o) => group(o) === "done");
  if (open.length) listBox.append(section("Em andamento", open));
  if (done.length) listBox.append(section("Finalizados", done));
}

async function load() {
  const ids = K.Orders.list().map((o) => o.id);
  let local = [], remote = [];
  try {
    if (ids.length) {
      const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Não foi possível consultar seus pedidos.");
      local = data.orders || [];
      // Pedidos que não existem mais saem da lista deste aparelho.
      const found = new Set(local.map((o) => o.public_id));
      ids.filter((id) => !found.has(id)).forEach((id) => K.Orders.remove(id));
    }
    if (me) { try { remote = (await A.call("orders", "GET")).orders || []; } catch (_) {} }
    const seen = new Set();
    orders = [...remote, ...local].filter((o) => (seen.has(o.public_id) ? false : seen.add(o.public_id)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    render();
  } catch (e) {
    listBox.replaceChildren(el("p", e.message, "form-note"));
    listBox.firstChild.dataset.error = "true";
  }
}

// Atualiza sozinho a cada 30 s enquanto a aba está aberta e há pedido em andamento.
function schedule() {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden && orders.some((o) => group(o) === "open")) load(); }, 30000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
$("#orders-refresh").addEventListener("click", load);

$("#recover-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements, fb = $("#recover-feedback"), btn = e.currentTarget.querySelector('[type="submit"]');
  if (!f.email.value.trim() || f.phone.value.replace(/\D/g, "").length < 10) return note(fb, "Informe o e-mail e o telefone com DDD.", true);
  btn.disabled = true; note(fb, "Buscando…");
  try {
    const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.email.value, phone: f.phone.value }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Não foi possível buscar seus pedidos.");
    (data.orders || []).forEach((o) => K.Orders.add(o.public_id));
    const n = (data.orders || []).length;
    note(fb, n === 1 ? "Pedido encontrado e adicionado à lista." : `${n} pedidos encontrados e adicionados à lista.`);
    f.phone.value = "";
    await load();
  } catch (error) { note(fb, error.message, true); }
  btn.disabled = false;
});


// ---------- Conta do cliente (login salvo no banco) ----------
const A = K.Account;
const guestBox = $("#account-guest"), userBox = $("#account-user");
let me = null;

function showAccount(user) {
  me = user;
  guestBox.hidden = Boolean(user); userBox.hidden = !user;
  $("#account-title").replaceChildren(...(user ? [document.createTextNode("Olá, "), el("span", (user.name || "cliente").split(" ")[0] + ".")] : [document.createTextNode("Entre e tenha tudo "), el("span", "salvo.")]));
  $("#account-lead").textContent = user ? "Seus pedidos, favoritos e endereço ficam salvos nesta conta, em qualquer aparelho." : "Com a conta, seus pedidos, favoritos e endereço ficam salvos e aparecem em qualquer aparelho. Comprar sem conta continua possível.";
  if (!user) return;
  $("#acc-name").textContent = user.name || "Sem nome"; $("#acc-email").textContent = user.email;
  const f = $("#profile-form").elements, a = user.address || {};
  f.name.value = user.name || ""; f.phone.value = user.phone || "";
  ["postal_code", "state", "address", "address_number", "complement", "city"].forEach((k) => { f[k].value = a[k] || ""; });
}

function tab(which) {
  const login = which === "login";
  $("#tab-login").setAttribute("aria-selected", String(login)); $("#tab-register").setAttribute("aria-selected", String(!login));
  $("#login-form").hidden = !login; $("#register-form").hidden = login;
}
$("#tab-login").addEventListener("click", () => tab("login"));
$("#tab-register").addEventListener("click", () => tab("register"));

async function afterAuth(user) {
  showAccount(user); K.refreshAccount();
  // Favoritos: junta os deste aparelho com os da conta e guarda nos dois lugares.
  try {
    const local = JSON.parse(localStorage.getItem("krypto-favorites-v1") || "[]").filter(Number.isSafeInteger);
    const merged = [...new Set([...(user.favorites || []), ...local])];
    localStorage.setItem("krypto-favorites-v1", JSON.stringify(merged));
    if (merged.length !== (user.favorites || []).length) await A.call("favorites", "PUT", { ids: merged });
  } catch (_) {}
  await load();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements, fb = $("#login-feedback"), btn = e.currentTarget.querySelector('[type="submit"]');
  btn.disabled = true; note(fb, "Entrando…");
  try { const user = await A.call("login", "POST", { email: f.email.value, password: f.password.value }); f.password.value = ""; note(fb, ""); await afterAuth(user); }
  catch (error) { note(fb, error.message, true); }
  btn.disabled = false;
});
$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements, fb = $("#register-feedback"), btn = e.currentTarget.querySelector('[type="submit"]');
  if (!f.consent.checked) return note(fb, "Confirme a leitura da Política de Privacidade para criar a conta.", true);
  btn.disabled = true; note(fb, "Criando sua conta…");
  try {
    const user = await A.call("register", "POST", { name: f.name.value, email: f.email.value, phone: f.phone.value, password: f.password.value, privacy_consent: true, website: f.website.value });
    f.password.value = ""; note(fb, ""); await afterAuth(user);
  } catch (error) { note(fb, error.message, true); }
  btn.disabled = false;
});
$("#acc-logout").addEventListener("click", async () => { try { await A.call("logout", "POST"); } catch (_) {} showAccount(null); K.refreshAccount(); await load(); });

$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements, fb = $("#profile-feedback");
  note(fb, "Salvando…");
  try {
    const address = { name: f.name.value, phone: f.phone.value, postal_code: f.postal_code.value, address: f.address.value, address_number: f.address_number.value, complement: f.complement.value, city: f.city.value, state: f.state.value };
    const user = await A.call("me", "PUT", { name: f.name.value, phone: f.phone.value, address });
    showAccount(user); K.refreshAccount(); note(fb, "Dados salvos. Eles já vêm preenchidos no checkout.");
  } catch (error) { note(fb, error.message, true); }
});
$("#password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements, fb = $("#password-feedback");
  note(fb, "Trocando…");
  try { await A.call("me", "PUT", { current_password: f.current_password.value, new_password: f.new_password.value }); f.current_password.value = ""; f.new_password.value = ""; note(fb, "Senha trocada."); }
  catch (error) { note(fb, error.message, true); }
});
$("#claim-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements, fb = $("#claim-feedback");
  note(fb, "Vinculando…");
  try { await A.call("claim", "POST", { code: f.code.value, email: f.email.value }); f.code.value = ""; note(fb, "Pedido vinculado à sua conta."); await load(); }
  catch (error) { note(fb, error.message, true); }
});

A.me().then((user) => { if (user) afterAuth(user); else showAccount(null); });

load().then(schedule);
