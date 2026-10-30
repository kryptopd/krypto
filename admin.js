const loginSection = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const loginFeedback = document.querySelector("#admin-login-feedback");
const adminMain = document.querySelector("#admin-main");
const productForm = document.querySelector(".product-editor");
const productFeedback = document.querySelector("#product-feedback");
const productGrid = document.querySelector("#admin-products-grid");
const ordersBody = document.querySelector("#orders-table-body");
let authorization = "";
let editingProductId = null;

const money = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function setMessage(element, message, isError = false) {
  element.textContent = message;
  if (isError) element.dataset.error = "true";
  else delete element.dataset.error;
}

function basicHeader(username, password) {
  const encoded = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  encoded.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
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
    total.append(element("small", `Pagamento: ${order.payment_status || "pendente"}`));
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
        setMessage(productFeedback, error.message, true);
        await loadDashboard();
      }
    });
    statusCell.append(statusSelect);
    row.append(id, customer, contact, address, items, total, statusCell);
    ordersBody.append(row);
  });
}

async function loadDashboard() {
  const data = await api("/api/admin/dashboard");
  document.querySelector("#stat-products").textContent = String(data.stats.product_count);
  document.querySelector("#stat-orders").textContent = String(data.stats.order_count);
  document.querySelector("#stat-pending").textContent = `${data.stats.pending_count} aguardando`;
  document.querySelector("#stat-sales").textContent = money(data.stats.sales_cents);
  renderProducts(data.products);
  renderOrders(data.orders);
}

async function tryLogin(username, password) {
  authorization = basicHeader(username, password);
  try {
    await loadDashboard();
    loginSection.hidden = true;
    adminMain.hidden = false;
    loginForm.elements.password.value = "";
    setMessage(loginFeedback, "");
  } catch (error) {
    authorization = "";
    setMessage(loginFeedback, error.message, true);
  }
}

function editProduct(product) {
  editingProductId = product.id;
  productForm.elements.produto.value = product.name;
  productForm.elements.categoria.value = product.category;
  productForm.elements.preco.value = (product.price_cents / 100).toFixed(2);
  productForm.elements.estoque.value = product.stock;
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
  await tryLogin(loginForm.elements.username.value, loginForm.elements.password.value);
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(productForm);
  const payload = {
    name: form.get("produto"),
    category: form.get("categoria"),
    price: Number(form.get("preco")),
    stock: Number(form.get("estoque")),
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
  const button = productForm.querySelector('[type="submit"]');
  button.innerHTML = "Cadastrar produto <span>↗</span>";
  setMessage(productFeedback, "Produtos cadastrados ficam visíveis na vitrine.");
});

document.querySelector("#admin-logout").addEventListener("click", () => {
  authorization = "";
  adminMain.hidden = true;
  loginSection.hidden = false;
  loginForm.reset();
  setMessage(loginFeedback, "Você saiu do painel.");
});
