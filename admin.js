const loginSection = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const loginFeedback = document.querySelector("#admin-login-feedback");
const adminMain = document.querySelector("#admin-main");
const productForm = document.querySelector(".product-editor");
const productFeedback = document.querySelector("#product-feedback");
const productGrid = document.querySelector("#admin-products-grid");
const ordersBody = document.querySelector("#orders-table-body");
const ordersFeedback = document.querySelector("#orders-feedback");
const paymentLabels = { pending: "Pendente", approved: "Pago", rejected: "Recusado", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestado", expired: "Expirado" };
let authorization = "";
let supabaseAuth = null;
let authInitError = "";
let editingProductId = null;
let categories = [], lastProducts = [];
// Cores da peça em edição: [{ id, name, hex, photos: [{ id, url, preview, pending }] }]. Sempre há ao menos uma.
let colors = [], activeColor = 0;
const SIZE_ORDER = ["M", "G", "GG", "G1"], MAX_PHOTOS = 4, MAX_COLORS = 12;
const CATALOG_API = "/api/admin/catalog";

const money = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function setMessage(element, message, isError = false) {
  element.textContent = message;
  if (isError) element.dataset.error = "true";
  else delete element.dataset.error;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", authorization);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(body.detail)
      ? body.detail.map((issue) => issue.msg).join(" ")
      : body.detail;
    throw new Error(detail || "Não foi possível concluir a operação.");
  }
  return body;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function coverOf(product) { return (product.images && product.images[0]) || product.image_url; }

function renderProducts(products) {
  lastProducts = products;
  productGrid.replaceChildren();
  document.querySelector("#catalog-count").textContent = `${products.length} ITENS`;

  if (!products.length) {
    productGrid.append(element("p", "Nenhum produto cadastrado."));
    return;
  }

  products.forEach((product) => {
    const card = element("article", undefined, "admin-product-card");
    const photo = element("div", undefined, "admin-product-photo");
    photo.style.backgroundImage = `url("${coverOf(product)}")`;
    const photoCount = (product.images && product.images.length) || 1;
    if (photoCount > 1) photo.append(element("span", `${photoCount} fotos`, "product-tag admin-photo-count"));
    const stockClass = product.stock > 5 ? "stock-ok" : "stock-low";
    photo.append(element("span", `${product.stock} disponíveis`, `admin-stock ${stockClass}`));

    const details = element("div", undefined, "admin-product-details");
    details.append(
      element("span", (product.category || "Sem categoria").toUpperCase(), "admin-product-category"),
      element("h3", product.name),
      element("p", product.description || "Sem descrição"),
      element("small", `Tamanhos: ${product.sizes && product.sizes.length ? product.sizes.join(", ") : "único"} · Peso: ${product.weight_grams ?? 300} g`, "admin-product-weight"),
    );
    if (Array.isArray(product.colors) && product.colors.length) {
      const dots = element("div", undefined, "admin-color-dots");
      product.colors.forEach((c) => { const d = element("i", undefined, "color-dot"); d.style.background = c.hex; d.title = c.name; dots.append(d); });
      dots.append(element("small", `${product.colors.length} ${product.colors.length === 1 ? "cor" : "cores"}`));
      details.append(dots);
    }
    const bottom = element("div", undefined, "admin-product-bottom");
    bottom.append(element("strong", money(product.price_cents)));
    const actions = element("div");
    const edit = element("button", "Editar", "admin-action");
    edit.type = "button";
    edit.addEventListener("click", () => editProduct(product));
    const remove = element("button", "Excluir", "admin-action delete-action");
    remove.type = "button";
    remove.addEventListener("click", () => deleteProduct(product));
    actions.append(edit, remove);
    bottom.append(actions);
    details.append(bottom);
    card.append(photo, details);
    productGrid.append(card);
  });
}

// Alerta de confirmação no estilo da marca (substitui window.confirm).
function confirmDeleteOrder(order) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = element("div", undefined, "krypto-modal-overlay");
    const box = element("div", undefined, "krypto-modal krypto-modal-danger");
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "krypto-modal-title");
    box.setAttribute("aria-describedby", "krypto-modal-desc");
    const list = element("ul", undefined, "krypto-modal-list");
    [
      "Esta exclusão é PERMANENTE e não pode ser desfeita.",
      "Os dados do cliente, endereço, itens e histórico do pedido serão apagados.",
      "Pedido sem pagamento ainda ativo tem o estoque devolvido ao catálogo.",
      "Exclusão não estorna pagamento. Reembolsos devem ser feitos antes, no banco ou no Mercado Pago.",
      "Considere cancelar o pedido em vez de excluir, se precisar manter o registro.",
    ].forEach((text) => list.append(element("li", text)));
    const check = document.createElement("input");
    check.type = "checkbox";
    check.id = "krypto-modal-check";
    const checkLabel = element("label", undefined, "krypto-modal-check");
    checkLabel.htmlFor = "krypto-modal-check";
    checkLabel.append(check, element("span", "Entendo que a exclusão é permanente e irreversível."));
    const cancel = element("button", "Cancelar", "button button-outline");
    const confirmBtn = element("button", "Excluir definitivamente", "button krypto-danger-button");
    cancel.type = confirmBtn.type = "button";
    confirmBtn.disabled = true;
    check.addEventListener("change", () => { confirmBtn.disabled = !check.checked; });
    const actions = element("div", undefined, "krypto-modal-actions");
    actions.append(cancel, confirmBtn);
    const title = element("h3", "Excluir pedido?");
    title.id = "krypto-modal-title";
    const desc = element("p", `Pedido #${order.public_id} · ${order.customer_name} · ${money(order.total_cents)}`, "krypto-modal-desc");
    desc.id = "krypto-modal-desc";
    box.append(element("span", "⚠ AÇÃO IRREVERSÍVEL", "krypto-modal-kicker"), title, desc, list, checkLabel, actions);
    overlay.append(box);
    const close = (result) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Tab") {
        const f = [check, cancel, confirmBtn].filter((n) => !n.disabled);
        const i = f.indexOf(document.activeElement);
        event.preventDefault();
        f[(i + (event.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    cancel.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(false); });
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    cancel.focus();
  });
}

function renderOrders(orders) {
  ordersBody.replaceChildren();
  document.querySelector("#orders-count").textContent = `${orders.length} PEDIDOS`;

  if (!orders.length) {
    const row = element("tr");
    const cell = element("td", "Nenhum pedido recebido.");
    cell.colSpan = 7;
    row.append(cell);
    ordersBody.append(row);
    return;
  }

  orders.forEach((order) => {
    const row = element("tr");
    const id = element("td", `#${order.public_id}`, "order-id");
    const createdAt = order.created_at.includes("T")
      ? order.created_at
      : `${order.created_at.replace(" ", "T")}Z`;
    id.append(element("small", new Date(createdAt).toLocaleString("pt-BR")));
    const customer = element("td");
    customer.append(element("strong", order.customer_name), element("small", order.email));
    const contact = element("td", order.phone);
    const address = element("td", `${order.address}, ${order.address_number}`);
    address.append(element("small", [
      order.complement,
      order.city,
      order.state,
      order.postal_code,
    ].filter(Boolean).join(" · ")));
    const items = element("td", order.items || "—");
    const total = element("td");
    total.append(element("strong", money(order.total_cents)));
    const methodLabel = order.payment_method === "pix" ? "PIX" : "Mercado Pago";
    const paymentLabel = paymentLabels[order.payment_status] || order.payment_status || "Pendente";
    total.append(element("small", `${methodLabel} · ${paymentLabel}`));
    if (order.discount_cents) total.append(element("small", `Desconto PIX −${money(order.discount_cents)}`));
    if (order.shipping_provider || order.tracking_code) total.append(element("small", `${order.shipping_provider || "Entrega"} ${order.tracking_code || ""}`));

    const statusCell = element("td");
    const statusSelect = document.createElement("select");
    statusSelect.className = `order-status status-${order.status}`;
    [
      ["aguardando", "Aguardando (pedido antigo)"],
      ["aguardando_pagamento", "Aguardando pagamento"],
      ["confirmado", "Pago/confirmado"],
      ["preparando", "Em preparação"],
      ["enviado", "Enviado"],
      ["entregue", "Entregue"],
      ["cancelado", "Cancelado"],
      ["expirado", "Expirado"],
    ].forEach(([value, label]) => {
      const option = element("option", label);
      option.value = value;
      statusSelect.append(option);
    });
    statusSelect.value = order.status;
    if (["aguardando", "aguardando_pagamento", "confirmado", "cancelado", "expirado"].includes(order.status)) {
      const protectedStatus = statusSelect.querySelector(`option[value="${order.status}"]`);
      if (protectedStatus) protectedStatus.disabled = true;
    }
    if (["cancelado", "expirado"].includes(order.status)) statusSelect.disabled = true;
    statusSelect.addEventListener("change", async () => {
      statusSelect.disabled = true;
      try {
        const trackingCode = statusSelect.value === "enviado"
          ? window.prompt("Código de rastreamento (opcional):", order.tracking_code || "") : undefined;
        const shippingProvider = statusSelect.value === "enviado"
          ? window.prompt("Transportadora (opcional):", order.shipping_provider || "") : undefined;
        await api(`/api/admin/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusSelect.value, ...(trackingCode !== undefined ? { tracking_code: trackingCode, shipping_provider: shippingProvider } : {}) }),
        });
        await loadDashboard();
      } catch (error) {
        setMessage(ordersFeedback, error.message, true);
        await loadDashboard();
      }
    });
    statusCell.append(statusSelect);
    if (order.payment_method === "pix" && order.payment_status === "pending" && ["aguardando", "aguardando_pagamento"].includes(order.status)) {
      const confirm = element("button", "Confirmar PIX", "button button-primary confirm-pix");
      confirm.type = "button";
      confirm.addEventListener("click", async () => {
        if (!window.confirm(`Confirme que o PIX de ${money(order.total_cents)} do pedido #${order.public_id} (${order.customer_name}) já entrou na sua conta.`)) return;
        confirm.disabled = true;
        confirm.textContent = "Confirmando…";
        try {
          await api(`/api/admin/orders/${order.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm_payment" }),
          });
          setMessage(ordersFeedback, `Pagamento do pedido #${order.public_id} confirmado.`);
        } catch (error) {
          setMessage(ordersFeedback, error.message, true);
        }
        await loadDashboard();
      });
      statusCell.append(confirm);
    }
    const remove = element("button", "Excluir pedido", "admin-action delete-action order-delete");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!(await confirmDeleteOrder(order))) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/orders/${order.id}`, { method: "DELETE" });
        setMessage(ordersFeedback, `Pedido #${order.public_id} excluído permanentemente.`);
      } catch (error) {
        setMessage(ordersFeedback, error.message, true);
      }
      await loadDashboard();
    });
    statusCell.append(remove);
    row.append(id, customer, contact, address, items, total, statusCell);
    ordersBody.append(row);
  });
}

// ---------- Frete e entrega ----------
const UF_NAMES = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
const shippingForm = document.querySelector("#shipping-form");
const shippingRows = document.querySelector("#shipping-rows");
const shippingFeedback = document.querySelector("#shipping-feedback");
const simState = document.querySelector("#sim-state");

// Aceita "19,90", "19.90" e "1.990,00".
const toCents = (value) => {
  const text = String(value ?? "").trim();
  const parsed = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : NaN;
};
const toReais = (cents) => (Number(cents || 0) / 100).toFixed(2).replace(".", ",");

function stateInput(uf, name, value, type = "text") {
  const input = document.createElement("input");
  input.type = type; input.name = `${name}-${uf}`; input.value = value;
  input.setAttribute("aria-label", `${name} ${uf}`);
  if (type === "number") { input.min = "0"; input.step = "1"; } else input.inputMode = "decimal";
  return input;
}

function renderShipping(shipping, error) {
  const banner = document.querySelector("#shipping-banner"), status = document.querySelector("#shipping-status");
  if (error || !shipping) {
    status.textContent = "INDISPONÍVEL";
    banner.hidden = false; banner.dataset.tone = "error";
    banner.textContent = error || "Não foi possível carregar as regras de frete.";
    shippingForm.hidden = true;
    return;
  }
  shippingForm.hidden = false;
  const s = shipping.settings;
  status.textContent = shipping.configured ? (s.free_shipping ? "FRETE GRÁTIS LIGADO" : "ATIVO") : "NÃO CONFIGURADO";
  banner.hidden = shipping.configured;
  if (!shipping.configured) {
    banner.dataset.tone = "warn";
    banner.textContent = "O frete ainda não foi configurado, então os clientes não conseguem finalizar compras. Revise os valores sugeridos abaixo (por região) e clique em “Salvar regras de frete”.";
  }
  const f = shippingForm.elements;
  f.free_shipping.checked = s.free_shipping;
  f.free_over.value = s.free_over_cents ? toReais(s.free_over_cents) : "";
  f.name.value = s.name;
  f.base_weight.value = s.base_weight_grams;
  f.packaging.value = s.packaging_grams;
  shippingRows.replaceChildren();
  simState.replaceChildren();
  Object.keys(UF_NAMES).forEach((uf) => {
    const r = s.states[uf];
    const row = element("tr");
    row.dataset.uf = uf;
    row.append(element("td", uf, "order-id"), element("td", UF_NAMES[uf]));
    const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.name = `enabled-${uf}`; enabled.checked = r.enabled; enabled.setAttribute("aria-label", `Entregar em ${UF_NAMES[uf]}`);
    const free = document.createElement("input"); free.type = "checkbox"; free.name = `free-${uf}`; free.checked = r.free; free.setAttribute("aria-label", `Frete grátis em ${UF_NAMES[uf]}`);
    const cells = [enabled, free, stateInput(uf, "base", toReais(r.base_cents)), stateInput(uf, "perkg", toReais(r.per_kg_cents)), stateInput(uf, "days", r.days, "number")];
    cells.forEach((node) => { const td = element("td"); td.append(node); row.append(td); });
    shippingRows.append(row);
    const opt = element("option", `${uf} — ${UF_NAMES[uf]}`); opt.value = uf; simState.append(opt);
  });
  simState.value = "SP";
  updateStatesMeta();
  simulate();
}

// Resumo mostrado quando a tabela de estados está recolhida.
function updateStatesMeta() {
  const meta = document.querySelector("#states-meta");
  const ufs = Object.keys(UF_NAMES), f = shippingForm.elements;
  const active = ufs.filter((uf) => f[`enabled-${uf}`]?.checked).length, free = ufs.filter((uf) => f[`free-${uf}`]?.checked).length;
  meta.textContent = `${active} de ${ufs.length} estados ativos${free ? ` · ${free} com frete grátis` : ""}`;
}

// Lê o formulário no mesmo formato que a API valida.
function collectShipping() {
  const f = shippingForm.elements;
  const settings = {
    name: f.name.value.trim() || "Frete padrão",
    free_shipping: f.free_shipping.checked,
    free_over_cents: f.free_over.value.trim() ? toCents(f.free_over.value) : 0,
    base_weight_grams: Number(f.base_weight.value),
    packaging_grams: Number(f.packaging.value || 0),
    states: {}
  };
  if (Number.isNaN(settings.free_over_cents)) throw new Error("Frete grátis a partir de: valor inválido.");
  Object.keys(UF_NAMES).forEach((uf) => {
    const base = toCents(f[`base-${uf}`].value), perKg = toCents(f[`perkg-${uf}`].value);
    if (Number.isNaN(base) || Number.isNaN(perKg)) throw new Error(`${uf}: confira o valor base e o valor por kg (use números, ex.: 19,90).`);
    settings.states[uf] = { enabled: f[`enabled-${uf}`].checked, free: f[`free-${uf}`].checked, base_cents: base, per_kg_cents: perKg, days: Number(f[`days-${uf}`].value || 0) };
  });
  return settings;
}

// Mesma conta do servidor (api/_lib/shipping.js), só para pré-visualizar.
function simulate() {
  const out = document.querySelector("#sim-result");
  try {
    const s = collectShipping(), uf = simState.value, rule = s.states[uf];
    if (!rule.enabled) { out.textContent = `Não entregamos em ${UF_NAMES[uf]}.`; return; }
    const weight = Math.max(0, Number(document.querySelector("#sim-weight").value) || 0) + s.packaging_grams;
    const subtotal = toCents(document.querySelector("#sim-subtotal").value) || 0;
    const extra = weight > s.base_weight_grams ? Math.ceil((weight - s.base_weight_grams) / 1000) : 0;
    const calc = rule.base_cents + extra * rule.per_kg_cents;
    const reason = s.free_shipping ? "frete grátis para todos" : rule.free ? `frete grátis em ${uf}` : (s.free_over_cents > 0 && subtotal >= s.free_over_cents) ? "pedido acima do valor de frete grátis" : "";
    out.textContent = `Peso total ${weight} g (com embalagem) · ${extra} kg extra · ${reason ? `Grátis (${reason}; calculado seria ${money(calc)})` : `Frete ${money(calc)}`}${rule.days ? ` · até ${rule.days} dias` : ""}`;
  } catch (e) { out.textContent = e.message; }
}
shippingForm.addEventListener("input", simulate);
shippingForm.addEventListener("change", simulate);
shippingForm.addEventListener("change", updateStatesMeta);

document.querySelector("#bulk-apply").addEventListener("click", () => {
  const base = document.querySelector("#bulk-base").value.trim(), perKg = document.querySelector("#bulk-perkg").value.trim(), days = document.querySelector("#bulk-days").value.trim();
  if (!base && !perKg && !days) return setMessage(shippingFeedback, "Preencha ao menos um campo para aplicar a todos os estados.", true);
  Object.keys(UF_NAMES).forEach((uf) => {
    if (base) shippingForm.elements[`base-${uf}`].value = toReais(toCents(base) || 0);
    if (perKg) shippingForm.elements[`perkg-${uf}`].value = toReais(toCents(perKg) || 0);
    if (days) shippingForm.elements[`days-${uf}`].value = days;
  });
  setMessage(shippingFeedback, "Valores aplicados em todos os estados. Clique em “Salvar regras de frete” para confirmar.");
  simulate();
});

shippingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = shippingForm.querySelector('[type="submit"]');
  let settings;
  try { settings = collectShipping(); } catch (error) { document.querySelector("#shipping-states").open = true; return setMessage(shippingFeedback, error.message, true); }
  button.disabled = true; setMessage(shippingFeedback, "Salvando…");
  try {
    const saved = await api("/api/shipping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    renderShipping(saved);
    setMessage(shippingFeedback, "Regras de frete salvas. Já valem para novos pedidos.");
  } catch (error) { setMessage(shippingFeedback, error.message, true); }
  finally { button.disabled = false; }
});


async function loadReviews() {
  const box=document.querySelector("#admin-reviews"); if(!box)return;
  try {
    const rows=await api("/api/admin/reviews");
    const filter=document.querySelector("#reviews-filter");
    const visible=rows.filter(r=>filter?.value==="all"||r.status===(filter?.value||"pending"));
    document.querySelector("#reviews-count").textContent=`${rows.length} AVALIAÇÕES`;
    box.replaceChildren();
    if(!visible.length){box.append(element("p","Nenhuma avaliação neste filtro."));return;}
    visible.forEach(r=>{
      const card=element("article",undefined,"moderation-card");
      const head=element("div",undefined,"moderation-head");
      head.append(element("strong",`${r.product_name} · ${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}`),element("span",({pending:"Aguardando",approved:"Aprovada",rejected:"Rejeitada"})[r.status]||r.status,"moderation-status"));
      const meta=element("small",`${r.customer_name} · ${r.email} · ${new Date(r.created_at).toLocaleString("pt-BR")}`);
      const comment=element("p",r.comment);
      const flag=r.spam_flag?element("strong",`⚠ ${r.spam_flag}`,"spam-flag"):null;
      const actions=element("div",undefined,"moderation-actions");
      const action=(label,status,cls)=>{const b=element("button",label,`admin-action ${cls||""}`);b.type="button";b.addEventListener("click",async()=>{try{await api(`/api/admin/reviews?id=${r.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});await loadReviews();}catch(e){setMessage(document.querySelector("#reviews-feedback"),e.message,true);}});actions.append(b);};
      if(r.status!=="approved")action("Aprovar","approved");
      if(r.status!=="rejected")action("Rejeitar","rejected","delete-action");
      const del=element("button","Excluir","admin-action delete-action");del.type="button";del.addEventListener("click",async()=>{if(!confirm("Excluir permanentemente esta avaliação?"))return;try{await api(`/api/admin/reviews?id=${r.id}`,{method:"DELETE"});await loadReviews();}catch(e){setMessage(document.querySelector("#reviews-feedback"),e.message,true);}});actions.append(del);
      card.append(head,meta);if(flag)card.append(flag);card.append(comment,actions);box.append(card);
    });
  } catch(e){setMessage(document.querySelector("#reviews-feedback"),e.message,true);}
}
async function loadSupport() {
 const box=document.querySelector("#admin-support");if(!box)return;
 try{
  const rows=await api("/api/admin/support");document.querySelector("#support-count").textContent=`${rows.length} SOLICITAÇÕES`;box.replaceChildren();
  if(!rows.length){box.append(element("p","Nenhuma solicitação recebida."));return;}
  rows.forEach(r=>{
   const card=element("article",undefined,"moderation-card");const head=element("div",undefined,"moderation-head");
   head.append(element("strong",`${r.reason} · Protocolo ${r.public_code}`),element("span",({open:"Aberta",in_review:"Em análise",resolved:"Resolvida",rejected:"Rejeitada"})[r.status]||r.status,"moderation-status"));
   const details=element("p",`${r.customer_name} · ${r.email} · ${r.phone}\nPedido: ${r.order_code} · Compra: ${new Date(`${r.purchase_date}T12:00:00`).toLocaleDateString("pt-BR")}`);
   const comment=element("p",r.comment);const photos=element("div",undefined,"admin-attachments");
   (r.photo_urls||[]).forEach(url=>{const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.textContent="Abrir foto";photos.append(a);});
   const actions=element("div",undefined,"moderation-actions");
   const select=document.createElement("select");select.className="admin-status-select";[["open","Aberta"],["in_review","Em análise"],["resolved","Resolvida"],["rejected","Rejeitada"]].forEach(([v,l])=>select.add(new Option(l,v)));select.value=r.status;
   const save=element("button","Atualizar status","admin-action");save.type="button";save.addEventListener("click",async()=>{try{await api(`/api/admin/support/${r.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:select.value})});await loadSupport();}catch(e){setMessage(document.querySelector("#support-admin-feedback"),e.message,true);}});
   actions.append(select,save);
   const del=element("button","Excluir solicitação","admin-action delete-action");del.type="button";del.disabled=r.status!=="resolved";del.title=del.disabled?"Marque como resolvida antes de excluir.":"Excluir definitivamente e apagar anexos";
   del.addEventListener("click",async()=>{if(!confirm("Excluir esta solicitação e suas fotos permanentemente? Esta ação não pode ser desfeita."))return;try{await api(`/api/admin/support/${r.id}`,{method:"DELETE"});await loadSupport();}catch(e){setMessage(document.querySelector("#support-admin-feedback"),e.message,true);}});
   actions.append(del);card.append(head,details,comment,photos,actions);box.append(card);
  });
 }catch(e){setMessage(document.querySelector("#support-admin-feedback"),e.message,true);}
}

document.querySelector("#reviews-filter")?.addEventListener("change", loadReviews);

async function loadDashboard() {
  const data = await api("/api/admin/dashboard");
  document.querySelector("#stat-products").textContent = String(data.stats.product_count);
  document.querySelector("#stat-orders").textContent = String(data.stats.order_count);
  document.querySelector("#stat-pending").textContent = `${data.stats.pending_count} aguardando`;
  document.querySelector("#stat-sales").textContent = money(data.stats.sales_cents);
  document.querySelector("#stat-stock").textContent = String(data.stats.units_in_stock || 0);
  document.querySelector("#stat-low-stock").textContent = String(data.stats.low_stock_count || 0);
  document.querySelector("#stat-out-stock").textContent = `${data.stats.out_of_stock_count || 0} esgotados`;
  document.querySelector("#stat-ticket").textContent = money(data.stats.average_ticket_cents || 0);
  categories = data.categories || [];
  renderProducts(data.products.filter((p) => p.active));   // "Excluir" só tira da vitrine; some também da lista do painel
  renderCategories(data.categories_error);
  renderOrders(data.orders);
  renderShipping(data.shipping, data.shipping_error);
  await Promise.all([loadReviews(), loadSupport(), loadSettings(), loadAlerts(), refreshPushUI()]);
}

async function tryLogin(email, password) {
  if (!supabaseAuth) {
    setMessage(loginFeedback, authInitError || "Não foi possível iniciar o login do Supabase. Confira a configuração e recarregue a página.", true);
    return;
  }
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) throw error;
    authorization = `Bearer ${data.session.access_token}`;
    await loadDashboard();
    loginSection.hidden = true;
    adminMain.hidden = false;
    loginForm.elements.password.value = "";
    setMessage(loginFeedback, "");
  } catch (error) {
    authorization = "";
    if (supabaseAuth) await supabaseAuth.auth.signOut();
    setMessage(loginFeedback, error.message || "Não foi possível entrar. Confira o e-mail, a senha e a autorização de administrador.", true);
  }
}

async function initializeAuth() {
  try {
    if (!window.supabase?.createClient) throw new Error("Biblioteca de autenticação indisponível.");
    const configResponse = await fetch("/api/auth/config", { cache: "no-store" });
    const config = await configResponse.json().catch(() => null);
    if (!config) throw new Error(`A API não respondeu (/api/auth/config devolveu HTTP ${configResponse.status} sem JSON). A função da Vercel não está sendo encontrada ou falhou no deploy.`);
    if (!configResponse.ok) throw new Error(config.detail || "Configuração do Supabase incompleta.");
    supabaseAuth = window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "krypto-admin-auth" }
    });
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (session?.access_token) {
      authorization = `Bearer ${session.access_token}`;
      try {
        await loadDashboard();
        loginSection.hidden = true;
        adminMain.hidden = false;
      } catch (error) {
        authorization = "";
        await supabaseAuth.auth.signOut();
        setMessage(loginFeedback, error.message, true);
      }
    }
    supabaseAuth.auth.onAuthStateChange((_event, sessionNow) => {
      authorization = sessionNow?.access_token ? `Bearer ${sessionNow.access_token}` : "";
    });
  } catch (error) {
    authInitError = error.message || "Erro ao iniciar autenticação.";
    console.error("[KRYPTO admin] Falha ao iniciar autenticação:", error);
    setMessage(loginFeedback, authInitError, true);
  }
}

function editProduct(product) {
  editingProductId = product.id;
  productForm.elements.produto.value = product.name;
  fillCategorySelect(product.category || "");
  productForm.elements.preco.value = (product.price_cents / 100).toFixed(2);
  productForm.elements.peso.value = product.weight_grams ?? 300;
  const chosen = new Set(product.sizes || []);
  productForm.querySelectorAll('input[name="tamanho"]').forEach((box) => { box.checked = chosen.has(box.value); });
  const toPhotos = (list) => (list || []).filter(Boolean).slice(0, MAX_PHOTOS).map((url) => ({ id: nextPhotoId(), url, preview: url, pending: false }));
  const saved = Array.isArray(product.colors) ? product.colors : [];
  resetColors(saved.length
    ? saved.map((c) => newColor({ name: c.name, hex: c.hex, photos: toPhotos(c.images) }))
    : [newColor({ photos: toPhotos(product.images && product.images.length ? product.images : [product.image_url]) })]);
  // Estoque por combinação. Peça antiga (sem variações): todo o estoque vai para a primeira combinação, para você distribuir.
  let legacyStock = 0;
  stockQty.clear();
  const sizesNow = checkedSizes();
  if (Array.isArray(product.variants) && product.variants.length) {
    product.variants.forEach((v) => {
      const color = colors.find((c) => (saved.length ? c.name === v.color : true));
      if (color) stockQty.set(`${color.id}|${v.size || ""}`, Number(v.stock) || 0);
    });
  } else if (Number(product.stock) > 0) {
    stockQty.set(`${colors[0].id}|${sizesNow[0] || ""}`, Number(product.stock));
    legacyStock = Number(product.stock);
  }
  renderStockMatrix();
  productForm.elements.descricao.value = product.description;
  productForm.querySelector('[type="submit"]').innerHTML = "Salvar alterações <span>↗</span>";
  showTab("produtos");
  document.querySelector("#produtos").scrollIntoView({ behavior: "smooth" });
  setMessage(productFeedback, legacyStock ? `Editando ${product.name}. O estoque antigo (${legacyStock}) foi colocado na primeira combinação: distribua entre cores e tamanhos.` : `Editando ${product.name}.`);
}

async function deleteProduct(product) {
  if (!window.confirm(`Excluir "${product.name}" do catálogo?`)) return;
  try {
    await api(`${CATALOG_API}?r=products&id=${product.id}`, { method: "DELETE" });
    await loadDashboard();
  } catch (error) {
    setMessage(productFeedback, error.message, true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginFeedback, "Verificando acesso...");
  await tryLogin(loginForm.elements.email.value.trim(), loginForm.elements.password.value);
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (colors.some((c) => c.photos.some((p) => p.pending))) return setMessage(productFeedback, "Aguarde o envio das fotos terminar.", true);
  const label = (c, i) => (c.name.trim() ? `da cor "${c.name.trim()}"` : `da cor ${i + 1}`);
  const emptyIndex = colors.findIndex((c) => !c.photos.length);
  if (emptyIndex >= 0) { activeColor = emptyIndex; renderColorEditor(); return setMessage(productFeedback, `Adicione ao menos uma foto ${label(colors[emptyIndex], emptyIndex)}.`, true); }
  const multiple = colors.length > 1 || colors[0].name.trim();
  if (multiple) {
    const unnamed = colors.findIndex((c) => !c.name.trim());
    if (unnamed >= 0) { activeColor = unnamed; renderColorEditor(); return setMessage(productFeedback, `Dê um nome para a cor ${unnamed + 1}.`, true); }
    const names = colors.map((c) => c.name.trim().toLowerCase());
    const dup = names.findIndex((n, i) => names.indexOf(n) !== i);
    if (dup >= 0) { activeColor = dup; renderColorEditor(); return setMessage(productFeedback, `A cor "${colors[dup].name.trim()}" está repetida.`, true); }
  }
  const form = new FormData(productForm);
  const payload = {
    name: form.get("produto"),
    category: form.get("categoria"),
    price: Number(form.get("preco")),
    variants: stockVariants(),
    weight_grams: Number(form.get("peso")),
    sizes: form.getAll("tamanho"),
    // Peça de uma cor só e sem nome continua como antes (só fotos); com nome ou várias cores, envia as cores.
    ...(multiple
      ? { colors: colors.map((c) => ({ name: c.name.trim(), hex: c.hex, images: c.photos.map((p) => p.url) })) }
      : { images: colors[0].photos.map((p) => p.url), colors: [] }),
    description: form.get("descricao"),
  };
  const button = productForm.querySelector('[type="submit"]');
  button.disabled = true;
  setMessage(productFeedback, editingProductId ? "Salvando alterações..." : "Cadastrando produto...");
  try {
    await api(
      editingProductId ? `${CATALOG_API}?r=products&id=${editingProductId}` : `${CATALOG_API}?r=products`,
      {
        method: editingProductId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    productForm.reset();   // o evento "reset" limpa fotos e modo de edição
    setMessage(productFeedback, "Produto salvo com sucesso.");
    await loadDashboard();
  } catch (error) {
    setMessage(productFeedback, error.message, true);
  } finally {
    button.disabled = false;
  }
});

// "Limpar formulário" (e depois de salvar): volta ao modo de cadastro e esvazia as fotos.
productForm.addEventListener("reset", () => {
  editingProductId = null;
  resetColors();
  setTimeout(renderStockMatrix, 0);
  productForm.querySelector('[type="submit"]').innerHTML = "Cadastrar produto <span>↗</span>";
  setTimeout(() => { fillCategorySelect(""); productForm.elements.peso.value = 300; }, 0);
  setMessage(productFeedback, "Produtos cadastrados ficam visíveis na vitrine.");
});

// ---------- Estoque por cor e tamanho ----------
const stockQty = new Map();   // "idDaCor|tamanho" -> quantidade
const stockMatrix = document.querySelector("#stock-matrix");
const stockTotal = document.querySelector("#stock-total");
const checkedSizes = () => SIZE_ORDER.filter((size) => productForm.querySelector(`input[name="tamanho"][value="${size}"]`)?.checked);
// Peça de uma cor só e sem nome: a cor vai vazia. Com nome ou várias cores, vale o nome.
const usesColorNames = () => colors.length > 1 || Boolean(colors[0].name.trim());
const colorKeyName = (c) => (usesColorNames() ? c.name.trim() : "");
function renderStockMatrix() {
  const sizes = checkedSizes(), cols = sizes.length ? sizes : [""];
  stockMatrix.replaceChildren();
  const head = element("tr"); head.append(element("th", "Cor"));
  cols.forEach((size) => head.append(element("th", size || "Estoque")));
  const thead = element("thead"); thead.append(head);
  const body = element("tbody");
  colors.forEach((color, index) => {
    const row = element("tr");
    const label = element("th", undefined, "stock-color");
    if (usesColorNames()) { const dot = element("i", undefined, "color-dot"); dot.style.background = color.hex; label.append(dot, document.createTextNode(color.name.trim() || `Cor ${index + 1}`)); }
    else label.textContent = "Única";
    row.append(label);
    cols.forEach((size) => {
      const key = `${color.id}|${size}`;
      const cell = element("td"), input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.max = "99999"; input.step = "1"; input.inputMode = "numeric";
      input.value = String(stockQty.get(key) || 0);
      input.setAttribute("aria-label", `Estoque ${color.name.trim() || `cor ${index + 1}`}${size ? ` tamanho ${size}` : ""}`);
      input.addEventListener("focus", () => input.select());
      input.addEventListener("input", () => { const n = Math.max(0, Math.floor(Number(input.value) || 0)); stockQty.set(key, n); updateStockTotal(); });
      cell.append(input); row.append(cell);
    });
    body.append(row);
  });
  stockMatrix.append(thead, body);
  updateStockTotal();
}
function updateStockTotal() {
  const sizes = checkedSizes(), cols = sizes.length ? sizes : [""];
  stockTotal.textContent = String(colors.reduce((sum, c) => sum + cols.reduce((n, s) => n + (stockQty.get(`${c.id}|${s}`) || 0), 0), 0));
}
function stockVariants() {
  const sizes = checkedSizes(), cols = sizes.length ? sizes : [""];
  return colors.flatMap((c) => cols.map((size) => ({ color: colorKeyName(c), size, stock: stockQty.get(`${c.id}|${size}`) || 0 })));
}
productForm.querySelectorAll('input[name="tamanho"]').forEach((box) => box.addEventListener("change", renderStockMatrix));

// ---------- Cores e fotos enviadas do aparelho (sem URL) ----------
const photoSlots = document.querySelector("#photo-slots");
const photoInput = document.querySelector("#photo-input");
const photoHelp = document.querySelector("#photo-help");
const colorTabs = document.querySelector("#color-tabs");
const colorNameInput = document.querySelector("#color-name");
const colorHexInput = document.querySelector("#color-hex");
const colorRemove = document.querySelector("#color-remove");
const colorPresets = document.querySelector("#color-presets");
const PHOTO_HELP_DEFAULT = photoHelp.textContent;
const PRESETS = [["Preto", "#111111"], ["Branco", "#f5f5f5"], ["Off-white", "#e8e2d0"], ["Cinza", "#8a8a8a"], ["Chumbo", "#3b3b40"], ["Azul-marinho", "#1f2a44"], ["Azul", "#2f5fd0"], ["Verde", "#2e6b4f"], ["Vermelho", "#c0392b"], ["Bordô", "#6d1f2c"], ["Bege", "#cdb99a"], ["Marrom", "#6b4a2f"], ["Rosa", "#e58fb3"], ["Roxo", "#7b3fb5"], ["Amarelo", "#e8c53a"], ["Laranja", "#e07a2f"]];
let photoSeq = 0, colorSeq = 0;
const nextPhotoId = () => `p${++photoSeq}`;
const newColor = (data = {}) => ({ id: `c${++colorSeq}`, name: data.name || "", hex: data.hex || "#111111", photos: data.photos || [] });
const cur = () => colors[activeColor];
const releasePreview = (p) => { if (p && p.preview && p.preview.startsWith("blob:")) URL.revokeObjectURL(p.preview); };

function resetColors(list) {
  stockQty.clear();
  colors.forEach((c) => c.photos.forEach(releasePreview));
  colors = list && list.length ? list : [newColor()];
  activeColor = 0;
  renderColorEditor();
}

function renderColorEditor() {
  colorTabs.replaceChildren();
  colors.forEach((color, index) => {
    const tab = element("button", undefined, "color-tab");
    tab.type = "button"; tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(index === activeColor));
    const dot = element("i", undefined, "color-dot"); dot.style.background = color.hex;
    tab.append(dot, element("span", color.name.trim() || `Cor ${index + 1}`), element("small", `${color.photos.length} ${color.photos.length === 1 ? "foto" : "fotos"}`));
    if (index === 0 && colors.length > 1) tab.append(element("b", "CAPA", "color-cover"));
    tab.addEventListener("click", () => { activeColor = index; renderColorEditor(); });
    colorTabs.append(tab);
  });
  if (colors.length < MAX_COLORS) {
    const add = element("button", "+ Adicionar cor", "color-tab color-add"); add.type = "button";
    add.addEventListener("click", () => { colors.push(newColor()); activeColor = colors.length - 1; renderColorEditor(); colorNameInput.focus(); });
    colorTabs.append(add);
  }
  colorNameInput.value = cur().name;
  colorHexInput.value = cur().hex;
  colorRemove.hidden = colors.length < 2;
  colorPresets.replaceChildren();
  PRESETS.forEach(([name, hex]) => {
    const b = element("button", undefined, "swatch-preset"); b.type = "button"; b.style.setProperty("--swatch", hex);
    b.title = name; b.setAttribute("aria-label", `Usar ${name}`); b.setAttribute("aria-pressed", String(cur().hex.toLowerCase() === hex && cur().name === name));
    b.addEventListener("click", () => { cur().name = name; cur().hex = hex; renderColorEditor(); });
    colorPresets.append(b);
  });
  renderPhotoSlots();
  renderStockMatrix();
}
colorNameInput.addEventListener("input", () => {
  cur().name = colorNameInput.value;
  renderStockMatrix();
  const tab = colorTabs.querySelectorAll(".color-tab")[activeColor];
  if (tab) tab.querySelector("span").textContent = cur().name.trim() || `Cor ${activeColor + 1}`;
});
colorHexInput.addEventListener("input", () => {
  cur().hex = colorHexInput.value;
  const dot = colorTabs.querySelectorAll(".color-dot")[activeColor];
  if (dot) dot.style.background = cur().hex;
});
colorRemove.addEventListener("click", () => {
  if (colors.length < 2) return;
  const color = cur();
  const used = color.photos.length;
  if (used && !window.confirm(`Remover a cor "${color.name.trim() || activeColor + 1}" e suas ${used} ${used === 1 ? "foto" : "fotos"}?`)) return;
  color.photos.forEach(releasePreview);
  colors.splice(activeColor, 1);
  activeColor = Math.max(0, activeColor - 1);
  renderColorEditor();
});

function renderPhotoSlots() {
  const photos = cur().photos;
  photoSlots.replaceChildren();
  photos.forEach((photo, index) => {
    const slot = element("div", undefined, `photo-slot${photo.pending ? " pending" : ""}`);
    slot.setAttribute("role", "listitem");
    const img = document.createElement("img");
    img.src = photo.preview || photo.url; img.alt = `Foto ${index + 1}${index === 0 ? " (principal da cor)" : ""}`;
    slot.append(img);
    if (index === 0) slot.append(element("span", "Principal", "photo-badge"));
    if (photo.pending) { slot.append(element("span", "Enviando…", "photo-status")); photoSlots.append(slot); return; }
    const bar = element("div", undefined, "photo-actions");
    const mk = (label, aria, handler, disabled) => {
      const b = element("button", label, "photo-btn"); b.type = "button"; b.setAttribute("aria-label", aria); b.disabled = Boolean(disabled);
      b.addEventListener("click", handler); return b;
    };
    bar.append(
      mk("◀", `Mover foto ${index + 1} para a esquerda`, () => movePhoto(index, -1), index === 0),
      mk("▶", `Mover foto ${index + 1} para a direita`, () => movePhoto(index, 1), index === photos.length - 1),
      mk("Remover", `Remover foto ${index + 1}`, () => removePhoto(photo.id))
    );
    slot.append(bar);
    photoSlots.append(slot);
  });
  if (photos.length < MAX_PHOTOS) {
    const add = element("button", undefined, "photo-add"); add.type = "button";
    add.append(element("strong", "+ Adicionar foto"), element("small", `${photos.length} de ${MAX_PHOTOS}`));
    add.addEventListener("click", () => photoInput.click());
    photoSlots.append(add);
  }
}
function movePhoto(index, delta) {
  const photos = cur().photos, target = index + delta;
  if (target < 0 || target >= photos.length) return;
  [photos[index], photos[target]] = [photos[target], photos[index]];
  renderPhotoSlots();
}
function removePhoto(id) {
  const color = cur();
  releasePreview(color.photos.find((p) => p.id === id));
  color.photos = color.photos.filter((p) => p.id !== id);
  renderColorEditor();
}

// Lê a foto, reduz para no máximo 1400 px e converte em JPEG leve (cabe no limite de envio e carrega rápido na loja).
async function compressPhoto(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch (_) {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler essa foto. Use JPG, PNG ou WebP.")); };
      img.src = url;
    });
  }
  const width = bitmap.width || bitmap.naturalWidth, height = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, 1400 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);   // PNG com fundo transparente vira fundo branco
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  let quality = 0.85, dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 2400000 && quality > 0.5) { quality -= 0.1; dataUrl = canvas.toDataURL("image/jpeg", quality); }
  if (dataUrl.length > 2400000) throw new Error("A foto ficou grande demais. Tente outra.");
  return dataUrl;
}

async function uploadFile(color, file) {
  const photo = { id: nextPhotoId(), url: "", preview: URL.createObjectURL(file), pending: true };
  color.photos.push(photo); renderColorEditor();
  try {
    const data = await compressPhoto(file);
    const saved = await api(`${CATALOG_API}?r=upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    photo.url = saved.url; photo.pending = false;
  } catch (error) {
    color.photos = color.photos.filter((p) => p.id !== photo.id);
    URL.revokeObjectURL(photo.preview);
    setMessage(photoHelp, `${file.name}: ${error.message}`, true);
  }
  if (colors.includes(color)) renderColorEditor();   // a cor pode ter sido removida durante o envio
}

photoInput.addEventListener("change", async () => {
  const files = [...photoInput.files].filter((f) => /^image\//.test(f.type));
  photoInput.value = "";
  if (!files.length) return;
  setMessage(photoHelp, PHOTO_HELP_DEFAULT);
  const color = cur(), room = MAX_PHOTOS - color.photos.length;
  if (files.length > room) setMessage(photoHelp, room > 0 ? `Cabem só ${MAX_PHOTOS} fotos por cor: usei as ${room} primeiras.` : `Esta cor já tem ${MAX_PHOTOS} fotos. Remova uma para trocar.`, true);
  await Promise.all(files.slice(0, Math.max(0, room)).map((f) => uploadFile(color, f)));
});
resetColors();

// ---------- Notificações do sistema (novos pedidos) ----------
const pushStatus = document.querySelector("#push-status"), pushHelp = document.querySelector("#push-help");
const pushEnable = document.querySelector("#push-enable"), pushTest = document.querySelector("#push-test"), pushDisable = document.querySelector("#push-disable");
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const urlBase64ToBytes = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
const deviceLabel = () => `${/Android/.test(navigator.userAgent) ? "Android" : isIos ? "iPhone/iPad" : /Mac/.test(navigator.platform) ? "Mac" : /Win/.test(navigator.platform) ? "Windows" : "Computador"} · ${/Edg\//.test(navigator.userAgent) ? "Edge" : /Chrome\//.test(navigator.userAgent) ? "Chrome" : /Firefox\//.test(navigator.userAgent) ? "Firefox" : "Safari"}`;
async function currentPushSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return reg ? reg.pushManager.getSubscription() : null;
}
async function refreshPushUI() {
  [pushEnable, pushTest, pushDisable].forEach((b) => { b.hidden = true; });
  if (!pushSupported) {
    pushStatus.textContent = isIos && !isStandalone ? "No iPhone, primeiro toque em Compartilhar → Adicionar à Tela de Início e abra o painel por esse ícone." : "Este navegador não suporta notificações do sistema.";
    return;
  }
  if (Notification.permission === "denied") { pushStatus.textContent = "As notificações estão bloqueadas neste navegador. Libere nas permissões do site (cadeado ao lado do endereço) e recarregue."; return; }
  try {
    const sub = await currentPushSubscription();
    if (sub) { pushStatus.textContent = "✓ Ativadas neste aparelho."; pushTest.hidden = false; pushDisable.hidden = false; }
    else { pushStatus.textContent = "Desativadas neste aparelho."; pushEnable.hidden = false; }
  } catch (error) { pushStatus.textContent = error.message; }
}
pushEnable.addEventListener("click", async () => {
  pushEnable.disabled = true; pushStatus.textContent = "Ativando…";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Você não permitiu as notificações. Toque em \"Permitir\" quando o navegador perguntar.");
    const { public_key: key } = await api("/api/admin/push");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription(); if (old) await old.unsubscribe();   // chave antiga (se mudou)
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) });
    await api("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }) });
    setMessage(pushHelp, "Pronto! Clique em “Enviar teste” para ver como chega.");
  } catch (error) { setMessage(pushHelp, error.message || "Não foi possível ativar as notificações.", true); }
  finally { pushEnable.disabled = false; await refreshPushUI(); }
});
pushTest.addEventListener("click", async () => {
  pushTest.disabled = true;
  try { const r = await api("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) }); setMessage(pushHelp, r.sent ? "Teste enviado. Deve aparecer em instantes." : "Não consegui enviar. Desative e ative de novo.", !r.sent); }
  catch (error) { setMessage(pushHelp, error.message, true); }
  finally { pushTest.disabled = false; }
});
pushDisable.addEventListener("click", async () => {
  pushDisable.disabled = true;
  try {
    const sub = await currentPushSubscription();
    if (sub) { await api("/api/admin/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setMessage(pushHelp, "Notificações desativadas neste aparelho.");
  } catch (error) { setMessage(pushHelp, error.message, true); }
  finally { pushDisable.disabled = false; await refreshPushUI(); }
});

// ---------- Configurações da loja ----------
const settingsForm = document.querySelector("#settings-form");
const settingsFeedback = document.querySelector("#settings-feedback");
const couponRows = document.querySelector("#coupon-rows");
const bannerPreview = document.querySelector("#banner-preview");
const bannerInput = document.querySelector("#banner-image-input");
const bannerHelp = document.querySelector("#banner-image-help");
const bannerClear = document.querySelector("#banner-image-clear");
let bannerImage = "";

function addCouponRow(coupon = { code: "", percent: "", active: true }) {
  const row = element("div", undefined, "coupon-row");
  const code = document.createElement("input"); code.type = "text"; code.maxLength = 20; code.placeholder = "CÓDIGO"; code.value = coupon.code; code.setAttribute("aria-label", "Código do cupom"); code.autocomplete = "off";
  code.addEventListener("input", () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  const percent = document.createElement("input"); percent.type = "number"; percent.min = "1"; percent.max = "50"; percent.step = "0.5"; percent.placeholder = "%"; percent.value = coupon.percent; percent.setAttribute("aria-label", "Desconto em porcentagem");
  const active = document.createElement("input"); active.type = "checkbox"; active.checked = coupon.active !== false; active.setAttribute("aria-label", "Cupom ativo");
  const activeLabel = element("label", undefined, "coupon-active"); activeLabel.append(active, element("span", "Ativo"));
  const remove = element("button", "Remover", "admin-action delete-action"); remove.type = "button";
  remove.addEventListener("click", () => row.remove());
  row.append(code, percent, activeLabel, remove);
  couponRows.append(row);
}
document.querySelector("#coupon-add").addEventListener("click", () => addCouponRow());

function showBanner(url) {
  bannerImage = url || "";
  bannerPreview.style.backgroundImage = url ? `url("${url.replace(/["\\]/g, "")}")` : "";
  bannerPreview.classList.toggle("has-image", Boolean(url));
  bannerClear.hidden = !url;
}
document.querySelector("#banner-image-pick").addEventListener("click", () => bannerInput.click());
bannerClear.addEventListener("click", () => showBanner(""));
bannerInput.addEventListener("change", async () => {
  const file = bannerInput.files[0]; bannerInput.value = "";
  if (!file) return;
  setMessage(bannerHelp, "Enviando…");
  try {
    const data = await compressPhoto(file);
    const saved = await api(`${CATALOG_API}?r=upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    showBanner(saved.url); setMessage(bannerHelp, "Imagem enviada. Clique em salvar para publicar.");
  } catch (error) { setMessage(bannerHelp, error.message, true); }
});

function fillSettings(s) {
  const f = settingsForm.elements;
  f.pix_discount_percent.value = s.pix_discount_percent || "";
  f.ga_id.value = s.ga_id || ""; f.pixel_id.value = s.pixel_id || "";
  f.whatsapp.value = s.whatsapp || ""; f.whatsapp_message.value = s.whatsapp_message || "";
  f.instagram.value = s.instagram ? s.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "") : "";
  f.email.value = s.email || ""; f.legal_name.value = s.legal_name || ""; f.cnpj.value = s.cnpj || ""; f.address.value = s.address || "";
  const b = s.banner || {};
  f.banner_enabled.checked = Boolean(b.enabled); f.banner_title.value = b.title || ""; f.banner_text.value = b.text || "";
  f.banner_cta_label.value = b.cta_label || ""; f.banner_cta_url.value = b.cta_url || ""; showBanner(b.image_url || "");
  couponRows.replaceChildren(); (s.coupons || []).forEach(addCouponRow);
}
async function loadSettings() {
  try { fillSettings(await api("/api/admin/settings")); } catch (error) { setMessage(settingsFeedback, error.message, true); }
}
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = settingsForm.elements, button = settingsForm.querySelector('[type="submit"]');
  const coupons = [...couponRows.querySelectorAll(".coupon-row")].map((row) => { const [code, percent, active] = row.querySelectorAll("input"); return { code: code.value, percent: percent.value, active: active.checked }; });
  button.disabled = true; setMessage(settingsFeedback, "Salvando…");
  try {
    const saved = await api("/api/admin/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix_discount_percent: f.pix_discount_percent.value, ga_id: f.ga_id.value, pixel_id: f.pixel_id.value,
        whatsapp: f.whatsapp.value, whatsapp_message: f.whatsapp_message.value, instagram: f.instagram.value, email: f.email.value,
        legal_name: f.legal_name.value, cnpj: f.cnpj.value, address: f.address.value,
        banner: { enabled: f.banner_enabled.checked, title: f.banner_title.value, text: f.banner_text.value, cta_label: f.banner_cta_label.value, cta_url: f.banner_cta_url.value, image_url: bannerImage },
        coupons,
      }),
    });
    fillSettings(saved);
    setMessage(settingsFeedback, "Configurações salvas. A loja atualiza em até 1 minuto.");
  } catch (error) { setMessage(settingsFeedback, error.message, true); }
  finally { button.disabled = false; }
});

// ---------- Avise-me (lista de espera) ----------
const alertsBox = document.querySelector("#admin-alerts");
const alertsFeedback = document.querySelector("#alerts-feedback");
const slugifyName = (name) => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "peca";
async function loadAlerts() {
  let data;
  try { data = await api("/api/admin/alerts"); } catch (error) { setMessage(alertsFeedback, error.message, true); return; }
  alertsBox.replaceChildren();
  const total = (data.groups || []).reduce((n, g) => n + g.people.length, 0);
  document.querySelector("#alerts-count").textContent = `${total} ${total === 1 ? "PESSOA" : "PESSOAS"}`;
  const tabCount = document.querySelector("#alerts-tab-count");
  tabCount.textContent = String(total); tabCount.hidden = total === 0;
  if (data.missing_migration) { setMessage(alertsFeedback, "Execute a migração 20261110_store_upgrade.sql no Supabase para usar a lista de espera.", true); return; }
  setMessage(alertsFeedback, "");
  if (!data.groups.length) { alertsBox.append(element("p", "Ninguém na lista de espera por enquanto.", "category-empty")); return; }
  data.groups.forEach((g) => {
    const card = element("article", undefined, "moderation-card");
    const head = element("div", undefined, "moderation-head");
    head.append(element("strong", `${g.name} · ${g.people.length} ${g.people.length === 1 ? "pessoa" : "pessoas"}`));
    head.append(element("span", g.stock > 0 ? `Voltou: ${g.stock} em estoque` : "Ainda esgotada", g.stock > 0 ? "moderation-status alert-back" : "moderation-status"));
    const list = element("p", g.people.map((p) => `${p.email}${p.color || p.size ? ` (${[p.color, p.size].filter(Boolean).join(", ")})` : ""}`).join("\n"));
    const actions = element("div", undefined, "moderation-actions");
    const emails = [...new Set(g.people.map((p) => p.email))];
    const copy = element("button", "Copiar e-mails", "admin-action"); copy.type = "button";
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(emails.join(", ")); setMessage(alertsFeedback, `${emails.length} e-mails copiados.`); } catch (_) { setMessage(alertsFeedback, "Não foi possível copiar. Selecione os e-mails na lista.", true); } });
    const mail = element("a", "Escrever e-mail", "admin-action");
    mail.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(`${g.name} voltou ao estoque na KRYPTO`)}&body=${encodeURIComponent(`Boas notícias! ${g.name} voltou ao estoque.\n\n${location.origin}/produto/${g.product_id}-${slugifyName(g.name)}\n\nCorra, as peças são limitadas.`)}`;
    const done = element("button", "Marcar como avisados", "admin-action delete-action"); done.type = "button";
    done.addEventListener("click", async () => {
      if (!window.confirm(`Apagar a lista de espera de "${g.name}"? Faça isso depois de avisar os clientes.`)) return;
      try { await api(`/api/admin/alerts?product_id=${g.product_id}`, { method: "DELETE" }); await loadAlerts(); } catch (error) { setMessage(alertsFeedback, error.message, true); }
    });
    actions.append(copy, mail, done);
    card.append(head, list, actions); alertsBox.append(card);
  });
}

// ---------- Categorias ----------
const categoryForm = document.querySelector("#category-form");
const categoryList = document.querySelector("#category-list");
const categoryFeedback = document.querySelector("#category-feedback");

function fillCategorySelect(selected) {
  const select = productForm.elements.categoria;
  const keep = selected !== undefined ? selected : select.value;
  select.replaceChildren(new Option("Sem categoria", ""));
  categories.forEach((c) => select.append(new Option(c.name, c.name)));
  select.value = categories.some((c) => c.name === keep) ? keep : "";
}

function renderCategories(error) {
  const banner = document.querySelector("#categories-banner");
  banner.hidden = !error; banner.dataset.tone = "warn"; banner.textContent = error || "";
  document.querySelector("#categories-count").textContent = `${categories.length} ${categories.length === 1 ? "CATEGORIA" : "CATEGORIAS"}`;
  categoryList.replaceChildren();
  if (!categories.length && !error) categoryList.append(element("li", "Nenhuma categoria ainda. Crie a primeira acima.", "category-empty"));
  categories.forEach((category) => {
    const used = lastProducts.length ? lastProducts.filter((p) => p.active && p.category === category.name).length : 0;
    const row = element("li", undefined, "category-item");
    const label = element("div");
    label.append(element("strong", category.name), element("small", used ? `${used} ${used === 1 ? "peça" : "peças"}` : "Nenhuma peça"));
    const remove = element("button", "Apagar", "admin-action delete-action"); remove.type = "button";
    remove.setAttribute("aria-label", `Apagar a categoria ${category.name}`);
    remove.addEventListener("click", () => deleteCategory(category, used));
    row.append(label, remove);
    categoryList.append(row);
  });
  fillCategorySelect();
}

async function deleteCategory(category, used) {
  const warn = used ? `\n\n${used} ${used === 1 ? "peça usa" : "peças usam"} essa categoria e vai ficar sem categoria (continua na loja).` : "";
  if (!window.confirm(`Apagar a categoria "${category.name}"?${warn}`)) return;
  try {
    await api(`${CATALOG_API}?r=categories&id=${category.id}`, { method: "DELETE" });
    setMessage(categoryFeedback, `Categoria "${category.name}" apagada.`);
    await loadDashboard();
  } catch (error) { setMessage(categoryFeedback, error.message, true); }
}

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = categoryForm.elements.nome, name = input.value.trim();
  if (!name) return setMessage(categoryFeedback, "Digite o nome da categoria.", true);
  const button = categoryForm.querySelector('[type="submit"]');
  button.disabled = true; setMessage(categoryFeedback, "Criando…");
  try {
    await api(`${CATALOG_API}?r=categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    input.value = "";
    setMessage(categoryFeedback, `Categoria "${name}" criada. Já aparece na lista de categorias do cadastro de produto.`);
    await loadDashboard();
  } catch (error) { setMessage(categoryFeedback, error.message, true); }
  finally { button.disabled = false; }
});

// ---------- Abas do painel ----------
const TABS = ["produtos", "categorias", "frete", "pedidos", "avaliacoes", "aviseme", "configuracoes", "atendimento"];
const tabButtons = [...document.querySelectorAll(".admin-tab")];
function showTab(name, { updateHash = true } = {}) {
  if (!TABS.includes(name)) name = "produtos";
  tabButtons.forEach((button) => {
    const active = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".admin-tab-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  if (updateHash && location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
}
tabButtons.forEach((button, index) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
  button.addEventListener("keydown", (e) => {
    const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = tabButtons[(index + move + tabButtons.length) % tabButtons.length];
    showTab(next.dataset.tab); next.focus();
  });
});
window.addEventListener("hashchange", () => { const name = location.hash.slice(1); if (TABS.includes(name)) showTab(name, { updateHash: false }); });
showTab(location.hash.slice(1), { updateHash: false });

document.querySelector("#admin-logout").addEventListener("click", async () => {
  authorization = "";
  if (supabaseAuth) await supabaseAuth.auth.signOut();
  adminMain.hidden = true;
  loginSection.hidden = false;
  loginForm.reset();
  setMessage(loginFeedback, "Você saiu do painel.");
});
document.querySelector("#admin-refresh").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await loadDashboard();
    setMessage(ordersFeedback, "Painel atualizado.");
  } catch (error) {
    setMessage(ordersFeedback, error.message, true);
  } finally {
    button.disabled = false;
  }
});

initializeAuth();
