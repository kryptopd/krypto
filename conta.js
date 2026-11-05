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

  const names = (o.items || []).map((i) => `${i.quantity}× ${i.name}${i.size ? ` (${i.size})` : ""}`);
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
  if (!ids.length) { orders = []; return render(); }
  try {
    const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Não foi possível consultar seus pedidos.");
    orders = data.orders || [];
    // Pedidos que não existem mais saem da lista deste aparelho.
    const found = new Set(orders.map((o) => o.public_id));
    ids.filter((id) => !found.has(id)).forEach((id) => K.Orders.remove(id));
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
  if (!f.email.value.trim() || !f.code.value.trim()) return note(fb, "Informe o e-mail e o código do pedido.", true);
  btn.disabled = true; note(fb, "Buscando…");
  try {
    const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.email.value, code: f.code.value }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Não foi possível buscar o pedido.");
    (data.orders || []).forEach((o) => K.Orders.add(o.public_id));
    note(fb, "Pedido encontrado e adicionado à lista.");
    f.code.value = "";
    await load();
  } catch (error) { note(fb, error.message, true); }
  btn.disabled = false;
});

load().then(schedule);
