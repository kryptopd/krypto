const checkoutForm = document.querySelector("#customer-form");
const productSelect = document.querySelector("#product-select");
const sizeSelect = document.querySelector("#size-select");
const sizeField = document.querySelector("#size-field");
const quantityInput = document.querySelector("#quantity-input");
const feedback = document.querySelector("#checkout-feedback");
const submitButton = checkoutForm.querySelector('[type="submit"]');
const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
let products = [], shipping = null;

function selectedProduct() { return products.find((product) => product.id === Number(productSelect.value)); }
function showError(message) { feedback.textContent = message; feedback.dataset.error = "true"; }
function refreshSummary() {
  const product = selectedProduct();
  const quantity = Math.max(1, Math.min(10, Number(quantityInput.value) || 1));
  quantityInput.max = String(Math.min(10, product?.stock || 10));
  if (quantity > Number(quantityInput.max)) quantityInput.value = quantityInput.max;
  if (!product) return;
  const subtotal = product.price_cents * Number(quantityInput.value);
  const shippingCents = shipping ? shipping.shipping_cents : 0;
  document.querySelector("#summary-name").textContent = product.name;
  document.querySelector("#summary-details").textContent = [product.category, sizeSelect.value ? `Tamanho ${sizeSelect.value}` : "", `Qtd. ${quantityInput.value}`].filter(Boolean).join(" · ");
  document.querySelector("#summary-price").textContent = money(subtotal);
  document.querySelector("#summary-subtotal").textContent = money(subtotal);
  document.querySelector("#summary-shipping").textContent = shipping ? (shipping.shipping_cents ? money(shipping.shipping_cents) : "Grátis") : "Indisponível";
  document.querySelector("#summary-total").textContent = money(subtotal + shippingCents);
  document.querySelector("#summary-quantity").textContent = `${quantityInput.value} ${Number(quantityInput.value) === 1 ? "item" : "itens"}`;
  document.querySelector("#summary-thumb").style.backgroundImage = `url("${product.image_url}")`;
  sizeField.hidden = product.sizes.length === 0;
  submitButton.disabled = product.stock < 1 || !shipping;
  submitButton.textContent = product.stock < 1 ? "Produto sem estoque ↗" : "Ir para pagamento ↗";
}
function updateSizes() {
  const product = selectedProduct(); sizeSelect.replaceChildren();
  product?.sizes.forEach((size) => { const option = document.createElement("option"); option.value = size; option.textContent = size; sizeSelect.append(option); });
  refreshSummary();
}
async function loadCheckout() {
  const [productResponse, shippingResponse] = await Promise.all([fetch("/api/products"), fetch("/api/shipping")]);
  if (!productResponse.ok) throw new Error("Não foi possível carregar o catálogo.");
  products = await productResponse.json();
  if (!products.length) throw new Error("Não há produtos disponíveis para compra.");
  if (!shippingResponse.ok) {
    const data = await shippingResponse.json().catch(() => ({}));
    throw new Error(data.detail || "Frete ainda não configurado pela loja.");
  }
  shipping = await shippingResponse.json();
  products.forEach((product) => { const option = document.createElement("option"); option.value = String(product.id); option.textContent = `${product.name} — ${money(product.price_cents)}`; productSelect.append(option); });
  const requestedId = Number(new URLSearchParams(location.search).get("product"));
  if (products.some((product) => product.id === requestedId)) productSelect.value = String(requestedId);
  document.querySelector("#summary-shipping").textContent = shipping.shipping_cents ? money(shipping.shipping_cents) : "Grátis";
  updateSizes();
}
productSelect.addEventListener("change", updateSizes);
sizeSelect.addEventListener("change", refreshSummary);
quantityInput.addEventListener("input", refreshSummary);
loadCheckout().catch((error) => { showError(error.message); submitButton.disabled = true; });

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const product = selectedProduct();
  if (!product || !shipping) return showError("O checkout não está disponível. Tente novamente mais tarde.");
  if (!document.querySelector("#privacy-consent").checked) return showError("Confirme a leitura da Política de Privacidade.");
  submitButton.disabled = true; feedback.textContent = "Criando pedido e preparando pagamento…"; delete feedback.dataset.error;
  const form = new FormData(checkoutForm);
  const payload = {
    privacy_consent: true,
    customer: {
      name: form.get("nome"), email: form.get("email"), phone: form.get("telefone"),
      address: form.get("endereco"), address_number: form.get("numero"), complement: form.get("complemento"),
      city: form.get("cidade"), state: form.get("estado"), postal_code: form.get("cep")
    },
    item: { product_id: product.id, quantity: Number(form.get("quantidade")), size: form.get("tamanho") || "" }
  };
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Não foi possível iniciar o pagamento.");
    feedback.textContent = `Pedido ${result.id} criado. Redirecionando ao Mercado Pago…`;
    window.location.assign(result.checkout_url);
  } catch (error) { showError(error.message || "Falha de comunicação. Tente novamente."); submitButton.disabled = false; }
});
