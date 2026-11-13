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

    if (product.featured) photo.append(element("span", "DESTAQUE", "product-tag admin-feature-tag"));
    if (product.publish_at && new Date(product.publish_at) > new Date()) photo.append(element("span", `Publica em ${new Date(product.publish_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`, "product-tag admin-schedule-tag"));
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
    const priceBox = element("div"); priceBox.append(element("strong", money(product.price_cents)));
    if (product.compare_at_cents) priceBox.append(element("small", ` de ${money(product.compare_at_cents)}`, "price-old"));
    bottom.append(priceBox);
    const actions = element("div");
    const edit = element("button", "Editar", "admin-action");
    edit.type = "button";
    edit.addEventListener("click", () => editProduct(product));
    const copy = element("button", "Duplicar", "admin-action");
    copy.type = "button";
    copy.addEventListener("click", () => duplicateProduct(product));
    const remove = element("button", "Excluir", "admin-action delete-action");
    remove.type = "button";
    remove.addEventListener("click", () => deleteProduct(product));
    actions.append(edit, copy, remove);
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
    const label = element("button", "Etiqueta", "admin-action order-print"); label.type = "button";
    label.addEventListener("click", () => printLabels([order]));
    statusCell.append(label);
    if (order.coupon_code) total.append(element("small", `Cupom ${order.coupon_code}`));
    if (order.shipping_service) total.append(element("small", `Frete: ${order.shipping_service}`));
    row.append(id, customer, contact, address, items, total, statusCell);
    ordersBody.append(row);
  });
}

// ---------- Pedidos: busca, filtros, paginação, planilha e impressão ----------
const STATUS_TABS = [["", "Todos"], ["aguardando_pagamento,aguardando", "Aguardando pagamento"], ["confirmado", "Pagos"], ["preparando", "Em preparação"], ["enviado", "Enviados"], ["entregue", "Entregues"], ["cancelado,expirado", "Cancelados/expirados"]];
const of = { q: "", status: "", payment: "", method: "", from: "", to: "", page: 1, per: 20 };
const ordersPager = document.querySelector("#orders-pager");
const ordersQuery = (extra = {}) => {
  const p = new URLSearchParams();
  Object.entries({ ...of, ...extra }).forEach(([k, v]) => { if (v !== "" && v != null) p.set(k, v); });
  return p.toString();
};
let lastOrders = [];
async function loadOrders() {
  const data = await api(`/api/admin/orders?${ordersQuery()}`);
  lastOrders = data.orders;
  renderOrders(data.orders);
  document.querySelector("#orders-count").textContent = `${data.total} ${data.total === 1 ? "PEDIDO" : "PEDIDOS"}`;
  // Abas de status com contagem.
  const chips = document.querySelector("#status-chips"); chips.replaceChildren();
  const sum = (keys) => keys.split(",").filter(Boolean).reduce((n, k) => n + (data.counts[k] || 0), 0);
  const all = Object.values(data.counts).reduce((n, v) => n + v, 0);
  STATUS_TABS.forEach(([value, label]) => {
    const b = element("button", undefined, "status-chip"); b.type = "button"; b.setAttribute("aria-pressed", String(of.status === value));
    b.append(document.createTextNode(label), element("b", String(value ? sum(value) : all)));
    b.addEventListener("click", () => { of.status = value; of.page = 1; loadOrders().catch((e) => setMessage(ordersFeedback, e.message, true)); });
    chips.append(b);
  });
  // Paginação
  ordersPager.replaceChildren(); ordersPager.hidden = data.pages <= 1;
  if (data.pages > 1) {
    const btn = (text, n, o = {}) => { const b = element("button", text, `pager-btn${o.current ? " current" : ""}`); b.type = "button"; b.disabled = Boolean(o.disabled); if (o.current) b.setAttribute("aria-current", "page"); if (!o.disabled && !o.current) b.addEventListener("click", () => { of.page = n; loadOrders(); }); return b; };
    ordersPager.append(btn("‹", of.page - 1, { disabled: of.page === 1 }));
    const shown = [...new Set([1, data.pages, of.page, of.page - 1, of.page + 1].filter((n) => n >= 1 && n <= data.pages))].sort((a, b) => a - b);
    let last = 0; shown.forEach((n) => { if (n - last > 1) ordersPager.append(element("span", "…", "pager-gap")); ordersPager.append(btn(String(n), n, { current: n === of.page })); last = n; });
    ordersPager.append(btn("›", of.page + 1, { disabled: of.page === data.pages }));
  }
}
let filterTimer = null;
const refilter = () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => { of.page = 1; loadOrders().catch((e) => setMessage(ordersFeedback, e.message, true)); }, 350); };
document.querySelector("#orders-q").addEventListener("input", (e) => { of.q = e.target.value.trim(); refilter(); });
[["#orders-payment", "payment"], ["#orders-method", "method"], ["#orders-from", "from"], ["#orders-to", "to"]].forEach(([sel, key]) => document.querySelector(sel).addEventListener("change", (e) => { of[key] = e.target.value; refilter(); }));
document.querySelector("#orders-clear").addEventListener("click", () => {
  Object.assign(of, { q: "", status: "", payment: "", method: "", from: "", to: "", page: 1 });
  ["#orders-q", "#orders-payment", "#orders-method", "#orders-from", "#orders-to"].forEach((s) => { document.querySelector(s).value = ""; });
  loadOrders().catch((e) => setMessage(ordersFeedback, e.message, true));
});

// Baixa um arquivo da API (precisa do cabeçalho de login, por isso não é um link simples).
async function downloadFile(path, filename) {
  const r = await fetch(path, { headers: { Authorization: authorization } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || "Não foi possível baixar."); }
  const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
document.querySelector("#orders-csv").addEventListener("click", async () => {
  try { setMessage(ordersFeedback, "Gerando planilha…"); await downloadFile(`/api/admin/orders?${ordersQuery({ export: "csv", page: "", per: "" })}`, `pedidos-krypto-${new Date().toISOString().slice(0, 10)}.csv`); setMessage(ordersFeedback, "Planilha baixada (abre no Excel). Vale o que está filtrado na tela."); }
  catch (error) { setMessage(ordersFeedback, error.message, true); }
});

// Impressão: abre uma janela só com o conteúdo e chama a impressora.
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function printWindow(title, bodyHtml) {
  const w = window.open("", "_blank");
  if (!w) { setMessage(ordersFeedback, "O navegador bloqueou a janela de impressão. Libere pop-ups para este site.", true); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:13px/1.45 Arial,Helvetica,sans-serif;margin:0;color:#000}
    .label{width:100mm;min-height:148mm;padding:7mm;box-sizing:border-box;page-break-after:always;border:1px solid #000;margin:0 0 4mm}
    .label h1{font-size:15px;margin:0 0 4px;letter-spacing:.08em}.label .code{font:700 22px monospace;margin:2px 0 8px}
    .label .to{border:2px solid #000;padding:6px;margin:8px 0;font-size:14px}.label .to b{font-size:16px}
    .label table{width:100%;border-collapse:collapse}.label td{padding:2px 0;border-bottom:1px dotted #999}
    .pick{padding:12mm;max-width:190mm}.pick h1{font-size:18px}.pick table{width:100%;border-collapse:collapse;margin:10px 0 20px}.pick th,.pick td{border:1px solid #444;padding:5px 7px;text-align:left}.pick th{background:#eee}
    @media print{.noprint{display:none}.label{border:1px solid #000}}</style></head><body>
    <p class="noprint" style="padding:8px;background:#ffd;border-bottom:1px solid #aa0">Use Ctrl+P (ou ⌘+P) para imprimir. Etiqueta pensada para papel 100×150 mm.</p>${bodyHtml}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
function printLabels(orders) {
  printWindow("Etiquetas KRYPTO", orders.map((o) => `<section class="label"><h1>KRYPTO · REMETENTE</h1><small>${esc(o.shipping_service || "Envio")}</small>
    <div class="code">#${esc(o.public_id)}</div>
    <div class="to">DESTINATÁRIO<br><b>${esc(o.customer_name)}</b><br>${esc(o.address)}, ${esc(o.address_number)}${o.complement ? ` — ${esc(o.complement)}` : ""}<br>${esc(o.city)} / ${esc(o.state)}<br><b>CEP ${esc(String(o.postal_code).replace(/^(\d{5})(\d{3})$/, "$1-$2"))}</b><br>Tel.: ${esc(o.phone)}</div>
    <table>${(o.items_raw || []).map((i) => `<tr><td>${esc(i.quantity)}×</td><td>${esc(i.name)}${i.color ? ` · ${esc(i.color)}` : ""}${i.size ? ` · ${esc(i.size)}` : ""}</td></tr>`).join("")}</table>
    ${o.tracking_code ? `<p>Rastreio: <b>${esc(o.shipping_provider || "")} ${esc(o.tracking_code)}</b></p>` : ""}</section>`).join(""));
}
document.querySelector("#orders-picklist").addEventListener("click", async () => {
  try {
    setMessage(ordersFeedback, "Montando o romaneio…");
    const data = await api(`/api/admin/orders?${new URLSearchParams({ status: "confirmado,preparando", per: "100" })}`);
    if (!data.orders.length) { setMessage(ordersFeedback, "Não há pedidos pagos para separar agora."); return; }
    const sum = new Map();
    data.orders.forEach((o) => (o.items_raw || []).forEach((i) => { const key = `${i.name}|${i.color || ""}|${i.size || ""}`; const r = sum.get(key) || { name: i.name, color: i.color || "", size: i.size || "", qty: 0 }; r.qty += Number(i.quantity || 0); sum.set(key, r); }));
    const rows = [...sum.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    printWindow("Romaneio de separação KRYPTO", `<section class="pick"><h1>Romaneio de separação</h1><p>${data.orders.length} pedido(s) pagos aguardando envio · ${new Date().toLocaleString("pt-BR")}</p>
      <h2>Peças a separar</h2><table><tr><th>Qtd.</th><th>Peça</th><th>Cor</th><th>Tamanho</th><th>✓</th></tr>${rows.map((r) => `<tr><td><b>${r.qty}</b></td><td>${esc(r.name)}</td><td>${esc(r.color)}</td><td>${esc(r.size)}</td><td></td></tr>`).join("")}</table>
      <h2>Pedidos</h2><table><tr><th>Pedido</th><th>Cliente</th><th>Cidade/UF</th><th>Itens</th></tr>${data.orders.map((o) => `<tr><td>#${esc(o.public_id)}</td><td>${esc(o.customer_name)}</td><td>${esc(o.city)}/${esc(o.state)}</td><td>${esc(o.items)}</td></tr>`).join("")}</table></section>`);
    setMessage(ordersFeedback, "");
  } catch (error) { setMessage(ordersFeedback, error.message, true); }
});

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
  renderProducts(data.products.filter((p) => p.active));
  renderLowStock(data.products);   // "Excluir" só tira da vitrine; some também da lista do painel
  renderCategories(data.categories_error);
  await loadOrders();
  renderShipping(data.shipping, data.shipping_error);
  await Promise.all([loadReviews(), loadSupport(), loadSettings(), loadAlerts(), refreshPushUI(), loadReport(), loadContacts()]);
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

// ISO -> valor do campo datetime-local (hora local).
const toLocalInput = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

// Duplicar: abre o formulário como cadastro NOVO, com os mesmos dados (nome com "(cópia)"). As fotos são compartilhadas com segurança.
function duplicateProduct(product) {
  editProduct({ ...product, name: `${product.name} (cópia)`, featured: false, publish_at: null });
  editingProductId = null;
  productForm.querySelector('[type="submit"]').innerHTML = "Cadastrar cópia <span>↗</span>";
  setMessage(productFeedback, `Duplicando ${product.name}. Ajuste o que for diferente e clique em Cadastrar cópia.`);
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
  productForm.elements.preco_de.value = product.compare_at_cents ? (product.compare_at_cents / 100).toFixed(2) : "";
  productForm.elements.composicao.value = product.composition || ""; productForm.elements.cuidados.value = product.care || "";
  productForm.elements.destaque.checked = Boolean(product.featured);
  productForm.elements.publicar_em.value = product.publish_at ? toLocalInput(product.publish_at) : "";
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
    compare_at: form.get("preco_de"),
    composition: form.get("composicao"), care: form.get("cuidados"),
    featured: Boolean(form.get("destaque")),
    publish_at: form.get("publicar_em") ? new Date(form.get("publicar_em")).toISOString() : "",
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

// Lê a foto e gera duas versões em WebP (leve): grande (até 1400 px) e pequena (640 px) para os cartões da loja.
// Navegador sem suporte a WebP: cai para JPEG, só com a versão grande.
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
  const render = (maxSide) => {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);   // PNG com fundo transparente vira fundo branco
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  const encode = (canvas, type, quality) => canvas.toDataURL(type, quality);
  const big = render(1400);
  let quality = 0.84, data = encode(big, "image/webp", quality), isWebp = data.startsWith("data:image/webp");
  if (!isWebp) data = encode(big, "image/jpeg", quality);
  while (data.length > 2400000 && quality > 0.5) { quality -= 0.1; data = encode(big, isWebp ? "image/webp" : "image/jpeg", quality); }
  if (data.length > 2400000) { if (bitmap.close) bitmap.close(); throw new Error("A foto ficou grande demais. Tente outra."); }
  let thumb = "";
  if (isWebp) { thumb = encode(render(640), "image/webp", 0.8); if (!thumb.startsWith("data:image/webp")) thumb = ""; }
  if (bitmap.close) bitmap.close();
  return { data, thumb };
}

async function uploadFile(color, file) {
  const photo = { id: nextPhotoId(), url: "", preview: URL.createObjectURL(file), pending: true };
  color.photos.push(photo); renderColorEditor();
  try {
    const { data, thumb } = await compressPhoto(file);
    const saved = await api(`${CATALOG_API}?r=upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, thumb }) });
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

// ---------- Importar peças por planilha (CSV) ----------
const importFile = document.querySelector("#import-file"), importRun = document.querySelector("#import-run"), importFeedback = document.querySelector("#import-feedback");
let importRows = [];
const IMPORT_HEADERS = ["nome", "categoria", "preco", "preco_de", "estoque", "tamanhos", "descricao", "composicao", "cuidados", "foto_url", "peso_gramas"];
const plain = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_");
function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const first = clean.split(/\r?\n/)[0] || "";
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) { if (c === '"') { if (clean[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}
document.querySelector("#import-template").addEventListener("click", () => {
  const sample = ["Camiseta Essential", "Camisetas", "129,90", "159,90", "20", "M G GG", "Algodão pesado, caimento oversized.", "100% algodão", "Lavar do avesso em água fria", "https://exemplo.com/foto.jpg", "300"];
  const csv = `\uFEFF${IMPORT_HEADERS.join(";")}\n${sample.map((v) => `"${v}"`).join(";")}\n`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "modelo-importacao-krypto.csv"; a.click(); URL.revokeObjectURL(a.href);
});
document.querySelector("#import-pick").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0]; importFile.value = ""; importRun.hidden = true; importRows = [];
  if (!file) return;
  try {
    const grid = parseCsv(await file.text());
    if (grid.length < 2) throw new Error("A planilha precisa ter o cabeçalho e ao menos uma linha.");
    const head = grid[0].map(plain);
    if (!head.includes("nome") || !head.includes("preco")) throw new Error("Cabeçalho inválido. Baixe o modelo e use as mesmas colunas (nome e preco são obrigatórias).");
    const col = (name) => head.indexOf(name);
    importRows = grid.slice(1).map((r) => ({
      name: r[col("nome")], category: r[col("categoria")], price: r[col("preco")], compare_at: r[col("preco_de")], stock: r[col("estoque")], sizes: r[col("tamanhos")],
      description: r[col("descricao")], composition: r[col("composicao")], care: r[col("cuidados")], image_url: r[col("foto_url")], weight_grams: r[col("peso_gramas")],
    }));
    setMessage(importFeedback, `${importRows.length} ${importRows.length === 1 ? "linha pronta" : "linhas prontas"} para importar. Clique em Importar.`);
    importRun.hidden = false;
  } catch (error) { setMessage(importFeedback, error.message, true); }
});
importRun.addEventListener("click", async () => {
  importRun.disabled = true; setMessage(importFeedback, "Importando…");
  try {
    const r = await api(`${CATALOG_API}?r=import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: importRows }) });
    const bad = r.errors.map((e) => `linha ${e.line}${e.name ? ` (${e.name})` : ""}: ${e.message}`).join(" · ");
    setMessage(importFeedback, `${r.created} ${r.created === 1 ? "peça criada" : "peças criadas"}.${bad ? ` Não importadas: ${bad}` : ""}`, Boolean(bad));
    importRun.hidden = true; importRows = [];
    await loadDashboard();
  } catch (error) { setMessage(importFeedback, error.message, true); }
  finally { importRun.disabled = false; }
});

// ---------- Estoque baixo ----------
let lowStockThreshold = 3;
function renderLowStock(products) {
  const panel = document.querySelector("#low-stock-panel"), list = document.querySelector("#low-stock-list");
  const rows = [];
  products.filter((p) => p.active).forEach((p) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length) variants.forEach((v) => { if (Number(v.stock) <= lowStockThreshold) rows.push({ p, label: [v.color, v.size].filter(Boolean).join(" / ") || "Única", stock: Number(v.stock) }); });
    else if (Number(p.stock) <= lowStockThreshold) rows.push({ p, label: "Total", stock: Number(p.stock) });
  });
  rows.sort((a, b) => a.stock - b.stock);
  list.replaceChildren();
  panel.hidden = rows.length === 0;
  document.querySelector("#low-stock-count").textContent = `${rows.length} ${rows.length === 1 ? "ITEM" : "ITENS"}`;
  rows.slice(0, 40).forEach(({ p, label, stock }) => {
    const li = element("li", undefined, stock === 0 ? "is-out" : "");
    li.append(element("strong", p.name), element("span", label), element("b", stock === 0 ? "Esgotado" : `${stock} un.`));
    const b = element("button", "Repor", "admin-action"); b.type = "button"; b.addEventListener("click", () => editProduct(p));
    li.append(b); list.append(li);
  });
}

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
    const { data } = await compressPhoto(file);
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
  // O primeiro cupom "só primeira compra" aparece no bloco próprio; os demais ficam na lista.
  const fo = (s.coupons || []).find((c) => c.first_order) || null;
  f.fo_enabled.checked = Boolean(fo && fo.active); f.fo_code.value = fo ? fo.code : ""; f.fo_percent.value = fo ? fo.percent : "";
  couponRows.replaceChildren(); (s.coupons || []).filter((c) => c !== fo).forEach(addCouponRow);
  f.low_stock_threshold.value = s.low_stock_threshold ?? 3; lowStockThreshold = Number(f.low_stock_threshold.value) || 0;
  f.newsletter_enabled.checked = Boolean(s.newsletter_enabled); f.google_verification.value = s.google_verification || "";
  document.querySelector("#feed-url").value = `${location.origin}/feed/google.xml`;
  if (lastProducts.length) renderLowStock(lastProducts);
}
async function loadSettings() {
  try { fillSettings(await api("/api/admin/settings")); } catch (error) { setMessage(settingsFeedback, error.message, true); }
}
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = settingsForm.elements, button = settingsForm.querySelector('[type="submit"]');
  const coupons = [...couponRows.querySelectorAll(".coupon-row")].map((row) => { const [code, percent, active] = row.querySelectorAll("input"); return { code: code.value, percent: percent.value, active: active.checked, first_order: false }; });
  const foCode = f.fo_code.value.trim();
  if (f.fo_enabled.checked && (!foCode || !f.fo_percent.value)) { setMessage(settingsFeedback, "Para ligar o cupom de primeiro pedido, informe o código e o desconto.", true); return; }
  if (foCode || f.fo_percent.value) coupons.push({ code: foCode, percent: f.fo_percent.value, active: f.fo_enabled.checked, first_order: true });
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
        low_stock_threshold: f.low_stock_threshold.value, newsletter_enabled: f.newsletter_enabled.checked, welcome_coupon: f.fo_enabled.checked && f.newsletter_enabled.checked ? foCode.toUpperCase().replace(/[^A-Z0-9]/g, "") : "",
        google_verification: f.google_verification.value,
      }),
    });
    fillSettings(saved);
    setMessage(settingsFeedback, "Configurações salvas. A loja atualiza em até 1 minuto.");
  } catch (error) { setMessage(settingsFeedback, error.message, true); }
  finally { button.disabled = false; }
});

// ---------- Relatórios (gráficos simples, sem biblioteca) ----------
const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
const moneyCompact = (c) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(c / 100);
const axisMoney = (c) => (c >= 1000000 ? moneyCompact(c) : money(c).replace(/,00$/, ""));
function niceMax(v) { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
const reportTip = document.createElement("div"); reportTip.className = "chart-tip"; reportTip.hidden = true; document.body.append(reportTip);
function showTip(x, y, value, label) { reportTip.replaceChildren(element("strong", value), element("span", label)); reportTip.hidden = false; reportTip.style.left = `${Math.min(window.innerWidth - 190, x + 14)}px`; reportTip.style.top = `${y + 14}px`; }
const hideTip = () => { reportTip.hidden = true; };

// Colunas: uma série só (faturamento), então sem legenda; o título diz o que é. Barras finas, topo arredondado, base reta.
function columnChart(box, points) {
  box.replaceChildren();
  const W = 720, H = 250, L = 56, R = 8, T = 10, B = 30, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Gráfico de faturamento", class: "chart-svg" });
  [0, 1, 2, 3, 4].forEach((i) => {
    const y = T + ih - (ih * i) / 4;
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y, class: "grid" }));
    const t = svgEl("text", { x: L - 8, y: y + 4, "text-anchor": "end", class: "axis" }); t.textContent = axisMoney((max * i) / 4); svg.append(t);
  });
  const slot = iw / points.length, bw = Math.min(24, Math.max(3, slot - 4));
  const every = Math.ceil(points.length / 8);
  points.forEach((p, i) => {
    const h = max ? (p.value / max) * ih : 0, x = L + slot * i + (slot - bw) / 2, y = T + ih - h;
    const g = svgEl("g", { tabindex: "0", role: "img", "aria-label": `${p.label}: ${money(p.value)}, ${p.orders} pedidos` });
    const hit = svgEl("rect", { x: L + slot * i, y: T, width: slot, height: ih, fill: "transparent" });
    if (h > 0) { const r = Math.min(4, bw / 2, h); g.append(svgEl("path", { d: `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`, class: "bar" })); }
    g.append(hit);
    const enter = (e) => { const b = (e.target.closest("g") || g).getBoundingClientRect(); showTip(e.clientX || b.left + b.width / 2, e.clientY || b.top, money(p.value), `${p.label} · ${p.orders} ${p.orders === 1 ? "pedido" : "pedidos"}`); g.classList.add("hot"); };
    g.addEventListener("pointermove", enter); g.addEventListener("focus", enter); g.addEventListener("pointerleave", () => { hideTip(); g.classList.remove("hot"); }); g.addEventListener("blur", () => { hideTip(); g.classList.remove("hot"); });
    svg.append(g);
    if (i % every === 0) { const t = svgEl("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle", class: "axis" }); t.textContent = p.short; svg.append(t); }
  });
  svg.append(svgEl("line", { x1: L, x2: W - R, y1: T + ih, y2: T + ih, class: "baseline" }));
  box.append(svg);
}

let reportDays = 30;
async function loadReport() {
  try {
    const r = await api(`/api/admin/reports?days=${reportDays}`);
    const t = r.totals;
    const kpis = document.querySelector("#report-kpis"); kpis.replaceChildren();
    [["Faturamento", money(t.revenue_cents)], ["Pedidos pagos", String(t.paid_orders)], ["Ticket médio", money(t.avg_ticket_cents)], ["Descontos dados", money(t.discount_cents)], ["Pagos / criados", `${t.conversion_paid}%`]].forEach(([label, value]) => {
      const k = element("div", undefined, "kpi"); k.append(element("span", label), element("strong", value)); kpis.append(k);
    });
    // Mais de 60 dias: agrupa por semana para as barras não ficarem minúsculas.
    const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    let points;
    if (r.daily.length > 60) {
      points = []; for (let i = 0; i < r.daily.length; i += 7) { const chunk = r.daily.slice(i, i + 7); points.push({ value: chunk.reduce((n, d) => n + d.revenue_cents, 0), orders: chunk.reduce((n, d) => n + d.orders, 0), label: `${fmt(chunk[0].date)} a ${fmt(chunk[chunk.length - 1].date)}`, short: fmt(chunk[0].date) }); }
      document.querySelector("#chart-daily-title").textContent = "Faturamento por semana";
    } else {
      points = r.daily.map((d) => ({ value: d.revenue_cents, orders: d.orders, label: new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }), short: fmt(d.date) }));
      document.querySelector("#chart-daily-title").textContent = "Faturamento por dia";
    }
    columnChart(document.querySelector("#chart-daily"), points);
    const body = document.querySelector("#chart-daily-table"); body.replaceChildren();
    points.forEach((p) => { const tr = element("tr"); tr.append(element("td", p.label), element("td", String(p.orders)), element("td", money(p.value))); body.append(tr); });
    // Peças mais vendidas: barras horizontais, valor na ponta.
    const top = document.querySelector("#chart-top"); top.replaceChildren();
    const maxUnits = Math.max(1, ...r.top_products.map((p) => p.units));
    if (!r.top_products.length) top.append(element("p", "Ainda sem vendas no período.", "category-empty"));
    r.top_products.forEach((p) => {
      const row = element("div", undefined, "hbar"); row.tabIndex = 0; row.setAttribute("aria-label", `${p.name}: ${p.units} unidades, ${money(p.revenue_cents)}`);
      const track = element("div", undefined, "hbar-track"); const fill = element("i"); fill.style.width = `${(p.units / maxUnits) * 100}%`; track.append(fill);
      row.append(element("span", p.name, "hbar-name"), track, element("b", `${p.units} un.`));
      row.title = `${p.name} · ${money(p.revenue_cents)}`;
      top.append(row);
    });
    const extra = document.querySelector("#report-extra"); extra.replaceChildren();
    const line = (a, b) => { const p = element("p", undefined, "report-line"); p.append(element("span", a), element("strong", b)); extra.append(p); };
    line("PIX", `${r.by_method.pix.orders} pedidos · ${money(r.by_method.pix.revenue_cents)}`);
    line("Cartão / Mercado Pago", `${r.by_method.mercadopago.orders} pedidos · ${money(r.by_method.mercadopago.revenue_cents)}`);
    (r.coupons || []).slice(0, 6).forEach((c) => line(`Cupom ${c.code}`, `${c.orders} ${c.orders === 1 ? "uso" : "usos"}`));
    setMessage(document.querySelector("#report-feedback"), "");
  } catch (error) { setMessage(document.querySelector("#report-feedback"), error.message, true); }
}
document.querySelector("#report-days").addEventListener("change", (e) => { reportDays = Number(e.target.value); loadReport(); });

// ---------- Clientes e interessados ----------
async function loadContacts() {
  const fb = document.querySelector("#contacts-feedback");
  try {
    const d = await api("/api/admin/contacts");
    if (d.missing_migration) { setMessage(fb, "Execute a migração 20261111_growth.sql no Supabase para usar contas de clientes e cadastro de novidades.", true); return; }
    setMessage(fb, "");
    document.querySelector("#contacts-count").textContent = `${d.customers.length + d.subscribers.length} CONTATOS`;
    document.querySelector("#customers-count").textContent = `(${d.customers.length})`; document.querySelector("#subscribers-count").textContent = `(${d.subscribers.length})`;
    const when = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
    const cb = document.querySelector("#customers-body"); cb.replaceChildren();
    if (!d.customers.length) { const tr = element("tr"), td = element("td", "Nenhuma conta criada ainda."); td.colSpan = 6; tr.append(td); cb.append(tr); }
    d.customers.forEach((c) => {
      const tr = element("tr"); const act = element("td");
      const reset = element("button", "Gerar senha temporária", "admin-action"); reset.type = "button";
      reset.addEventListener("click", async () => {
        if (!window.confirm(`Gerar uma senha temporária para ${c.email}? A senha atual deixa de valer. Envie a nova ao cliente (ex.: WhatsApp) e peça para trocá-la em Minha conta.`)) return;
        try { const r = await api("/api/admin/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: c.id, action: "reset_password" }) }); window.prompt(`Senha temporária de ${c.email} (copie e envie ao cliente):`, r.temporary_password); }
        catch (error) { setMessage(fb, error.message, true); }
      });
      act.append(reset);
      tr.append(element("td", c.name || "—"), element("td", c.email), element("td", c.phone || "—"), element("td", when(c.created_at)), element("td", when(c.last_login_at)), act); cb.append(tr);
    });
    const sb = document.querySelector("#subscribers-body"); sb.replaceChildren();
    if (!d.subscribers.length) { const tr = element("tr"), td = element("td", "Nenhum e-mail cadastrado ainda."); td.colSpan = 4; tr.append(td); sb.append(tr); }
    d.subscribers.forEach((s) => {
      const tr = element("tr"), act = element("td");
      const del = element("button", "Remover", "admin-action delete-action"); del.type = "button";
      del.addEventListener("click", async () => { if (!window.confirm(`Remover ${s.email} da lista (pedido de descadastro)?`)) return; try { await api(`/api/admin/contacts?subscriber=${s.id}`, { method: "DELETE" }); await loadContacts(); } catch (error) { setMessage(fb, error.message, true); } });
      act.append(del); tr.append(element("td", s.email), element("td", s.source), element("td", when(s.created_at)), act); sb.append(tr);
    });
  } catch (error) { setMessage(fb, error.message, true); }
}
document.querySelector("#contacts-csv").addEventListener("click", async () => { try { await downloadFile("/api/admin/contacts?export=csv", `contatos-krypto-${new Date().toISOString().slice(0, 10)}.csv`); } catch (error) { setMessage(document.querySelector("#contacts-feedback"), error.message, true); } });

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
const TABS = ["produtos", "categorias", "frete", "pedidos", "relatorios", "contatos", "avaliacoes", "aviseme", "configuracoes", "atendimento"];
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
