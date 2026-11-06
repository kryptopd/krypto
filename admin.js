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
let editingProductId = null;

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

function renderProducts(products) {
  productGrid.replaceChildren();
  document.querySelector("#catalog-count").textContent = `${products.length} ITENS`;

  if (!products.length) {
    productGrid.append(element("p", "Nenhum produto cadastrado."));
    return;
  }

  products.forEach((product) => {
    const card = element("article", undefined, "admin-product-card");
    const photo = element("div", undefined, "admin-product-photo");
    photo.style.backgroundImage = `url("${product.image_url}")`;
    if (product.tag) photo.append(element("span", product.tag, "product-tag"));
    const stockClass = product.stock > 5 ? "stock-ok" : "stock-low";
    photo.append(element("span", `${product.stock} disponíveis`, `admin-stock ${stockClass}`));

    const details = element("div", undefined, "admin-product-details");
    details.append(
      element("span", product.category.toUpperCase(), "admin-product-category"),
      element("h3", product.name),
      element("p", product.description || "Sem descrição"),
      element("small", `Peso: ${product.weight_grams ?? 300} g`, "admin-product-weight"),
    );
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

async function loadDashboard() {
  const data = await api("/api/admin/dashboard");
  document.querySelector("#stat-products").textContent = String(data.stats.product_count);
  document.querySelector("#stat-orders").textContent = String(data.stats.order_count);
  document.querySelector("#stat-pending").textContent = `${data.stats.pending_count} aguardando`;
  document.querySelector("#stat-sales").textContent = money(data.stats.sales_cents);
  renderProducts(data.products);
  renderOrders(data.orders);
  renderShipping(data.shipping, data.shipping_error);
}

async function tryLogin(email, password) {
  if (!supabaseAuth) {
    setMessage(loginFeedback, "Não foi possível iniciar o login do Supabase. Confira a configuração e recarregue a página.", true);
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
    const config = await configResponse.json();
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
    setMessage(loginFeedback, error.message || "Erro ao iniciar autenticação.", true);
  }
}

function editProduct(product) {
  editingProductId = product.id;
  productForm.elements.produto.value = product.name;
  productForm.elements.categoria.value = product.category;
  productForm.elements.preco.value = (product.price_cents / 100).toFixed(2);
  productForm.elements.estoque.value = product.stock;
  productForm.elements.peso.value = product.weight_grams ?? 300;
  productForm.elements.tamanhos.value = product.sizes.join(", ");
  productForm.elements.imagem.value = product.image_url;
  productForm.elements.descricao.value = product.description;
  productForm.elements.tag.value = product.tag;
  productForm.querySelector('[type="submit"]').innerHTML = "Salvar alterações <span>↗</span>";
  document.querySelector("#produtos").scrollIntoView({ behavior: "smooth" });
  setMessage(productFeedback, `Editando ${product.name}.`);
}

async function deleteProduct(product) {
  if (!window.confirm(`Excluir "${product.name}" do catálogo?`)) return;
  try {
    await api(`/api/admin/products/${product.id}`, { method: "DELETE" });
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
  const form = new FormData(productForm);
  const payload = {
    name: form.get("produto"),
    category: form.get("categoria"),
    price: Number(form.get("preco")),
    stock: Number(form.get("estoque")),
    weight_grams: Number(form.get("peso")),
    sizes: String(form.get("tamanhos")).split(",").map((size) => size.trim()).filter(Boolean),
    tag: form.get("tag"),
    image_url: form.get("imagem"),
    description: form.get("descricao"),
  };
  const button = productForm.querySelector('[type="submit"]');
  button.disabled = true;
  setMessage(productFeedback, editingProductId ? "Salvando alterações..." : "Cadastrando produto...");
  try {
    await api(
      editingProductId ? `/api/admin/products/${editingProductId}` : "/api/admin/products",
      {
        method: editingProductId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    productForm.reset();
    editingProductId = null;
    button.innerHTML = "Cadastrar produto <span>↗</span>";
    setMessage(productFeedback, "Produto salvo com sucesso.");
    await loadDashboard();
  } catch (error) {
    setMessage(productFeedback, error.message, true);
  } finally {
    button.disabled = false;
  }
});

productForm.addEventListener("reset", () => {
  editingProductId = null;
  setTimeout(() => { productForm.elements.peso.value = 300; }, 0);
  const button = productForm.querySelector('[type="submit"]');
  button.innerHTML = "Cadastrar produto <span>↗</span>";
  setMessage(productFeedback, "Produtos cadastrados ficam visíveis na vitrine.");
});

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
