const checkoutForm = document.querySelector("#customer-form");
const productSelect = document.querySelector("#product-select");
const sizeSelect = document.querySelector("#size-select");
const sizeField = document.querySelector("#size-field");
const quantityInput = document.querySelector("#quantity-input");
const feedback = document.querySelector("#checkout-feedback");
const submitButton = checkoutForm.querySelector('[type="submit"]');
const money = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
let products = [];

function selectedProduct() {
  return products.find((product) => product.id === Number(productSelect.value));
}

function refreshSummary() {
  const product = selectedProduct();
  const quantity = Math.max(1, Math.min(10, Number(quantityInput.value) || 1));
  quantityInput.max = String(Math.min(10, product?.stock || 10));
  if (quantity > Number(quantityInput.max)) quantityInput.value = quantityInput.max;

  if (!product) return;
  const total = product.price_cents * Number(quantityInput.value);
  document.querySelector("#summary-name").textContent = product.name;
  document.querySelector("#summary-details").textContent = [
    product.category,
    sizeSelect.value ? `Tamanho ${sizeSelect.value}` : "",
    `Qtd. ${quantityInput.value}`,
  ].filter(Boolean).join(" · ");
  document.querySelector("#summary-price").textContent = money(total);
  document.querySelector("#summary-subtotal").textContent = money(total);
  document.querySelector("#summary-total").textContent = money(total);
  document.querySelector("#summary-quantity").textContent =
    `${quantityInput.value} ${Number(quantityInput.value) === 1 ? "item" : "itens"}`;
  document.querySelector("#summary-thumb").style.backgroundImage = `url("${product.image_url}")`;
  sizeField.hidden = product.sizes.length === 0;
  submitButton.disabled = product.stock < 1;
  submitButton.textContent = product.stock < 1
    ? "Produto sem estoque"
    : "Criar pedido de teste ↗";
  if (product.stock < 1) {
    feedback.textContent = "Este produto está sem estoque.";
    feedback.dataset.error = "true";
  } else {
    feedback.textContent = "Seus dados são usados apenas para este pedido de teste.";
    delete feedback.dataset.error;
  }
}

function showError(message) {
  feedback.textContent = message;
  feedback.dataset.error = "true";
}

fetch("/api/products")
  .then(async (response) => {
    if (!response.ok) throw new Error("Não foi possível carregar os produtos.");
    products = await response.json();
    if (!products.length) throw new Error("Não há produtos disponíveis para compra.");

    const requestedId = Number(new URLSearchParams(location.search).get("product"));
    products.forEach((product) => {
      const option = document.createElement("option");
      option.value = String(product.id);
      option.textContent = `${product.name} — ${money(product.price_cents)}`;
      productSelect.append(option);
    });
    if (products.some((product) => product.id === requestedId)) {
      productSelect.value = String(requestedId);
    }
    updateSizes();
    refreshSummary();
  })
  .catch((error) => {
    showError(error.message);
    submitButton.disabled = true;
  });

function updateSizes() {
  const product = selectedProduct();
  sizeSelect.replaceChildren();
  product?.sizes.forEach((size) => {
    const option = document.createElement("option");
    option.value = size;
    option.textContent = size;
    sizeSelect.append(option);
  });
  refreshSummary();
}

productSelect.addEventListener("change", updateSizes);
sizeSelect.addEventListener("change", refreshSummary);
quantityInput.addEventListener("input", refreshSummary);

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const product = selectedProduct();
  if (!product) return showError("Selecione um produto para continuar.");
  submitButton.disabled = true;
  feedback.textContent = "Enviando seu pedido...";
  delete feedback.dataset.error;

  const form = new FormData(checkoutForm);
  const payload = {
    customer: {
      name: form.get("nome"),
      email: form.get("email"),
      phone: form.get("telefone"),
      address: form.get("endereco"),
      address_number: form.get("numero"),
      complement: form.get("complemento"),
      city: form.get("cidade"),
      state: form.get("estado"),
      postal_code: form.get("cep"),
    },
    item: {
      product_id: product.id,
      quantity: Number(form.get("quantidade")),
      size: form.get("tamanho") || "",
    },
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(result.detail)
        ? result.detail.map((issue) => issue.msg).join(" ")
        : result.detail;
      throw new Error(detail || "Não foi possível criar o pedido.");
    }
    feedback.textContent =
      `Pedido ${result.id} criado com sucesso. Total: ${money(result.total_cents)}.`;
    submitButton.textContent = "Pedido criado";
    submitButton.disabled = true;
  } catch (error) {
    showError(error.message || "Falha de comunicação. Tente novamente.");
    submitButton.disabled = product.stock < 1;
  }
});
