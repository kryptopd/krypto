const checkoutForm = document.querySelector("#customer-form");
const productSelect = document.querySelector("#product-select");
const sizeSelect = document.querySelector("#size-select");
const sizeField = document.querySelector("#size-field");
const quantityInput = document.querySelector("#quantity-input");
const feedback = document.querySelector("#checkout-feedback");
const submitButton = checkoutForm.querySelector('[type="submit"]');
const mpOption = document.querySelector("#mp-option");
const secureNoteText = document.querySelector("#secure-note-text");
const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
let products = [], shipping = null, loaded = false, submitting = false;

function selectedProduct() { return products.find((product) => product.id === Number(productSelect.value)); }
function paymentMethod() { return checkoutForm.elements.payment_method.value; }
function showError(message) { feedback.textContent = message; feedback.dataset.error = "true"; }
function clearMessage(message = "") { feedback.textContent = message; delete feedback.dataset.error; }

function refreshButton() {
  const product = selectedProduct();
  const soldOut = product && product.stock < 1;
  submitButton.disabled = submitting || !loaded || soldOut || !shipping;
  if (submitting) return;
  if (soldOut) submitButton.innerHTML = "Produto sem estoque";
  else submitButton.innerHTML = paymentMethod() === "pix" ? 'Confirmar e ver chave PIX <span aria-hidden="true">↗</span>' : 'Ir para o pagamento <span aria-hidden="true">↗</span>';
  secureNoteText.textContent = paymentMethod() === "pix"
    ? "Você verá a chave PIX logo após confirmar o pedido."
    : "Pagamento processado com segurança pelo Mercado Pago.";
}

function refreshSummary() {
  const product = selectedProduct();
  const quantity = Math.max(1, Math.min(10, Number(quantityInput.value) || 1));
  quantityInput.max = String(Math.max(1, Math.min(10, product?.stock || 10)));
  if (quantity > Number(quantityInput.max)) quantityInput.value = quantityInput.max;
  if (!product) return;
  const qty = Number(quantityInput.value) || 1;
  const subtotal = product.price_cents * qty;
  const shippingCents = shipping ? shipping.shipping_cents : 0;
  document.querySelector("#summary-name").textContent = product.name;
  document.querySelector("#summary-details").textContent = [product.category, sizeSelect.value ? `Tamanho ${sizeSelect.value}` : "", `Qtd. ${qty}`].filter(Boolean).join(" · ");
  document.querySelector("#summary-price").textContent = money(subtotal);
  document.querySelector("#summary-subtotal").textContent = money(subtotal);
  document.querySelector("#summary-shipping").textContent = shipping ? (shipping.shipping_cents ? money(shipping.shipping_cents) : "Grátis") : "Indisponível";
  document.querySelector("#summary-total").textContent = money(subtotal + shippingCents);
  document.querySelector("#summary-quantity").textContent = `${qty} ${qty === 1 ? "item" : "itens"}`;
  document.querySelector("#summary-thumb").style.backgroundImage = `url("${product.image_url}")`;
  sizeField.hidden = product.sizes.length === 0;
  refreshButton();
}
function updateSizes() {
  const product = selectedProduct(); sizeSelect.replaceChildren();
  product?.sizes.forEach((size) => { const option = document.createElement("option"); option.value = size; option.textContent = size; sizeSelect.append(option); });
  refreshSummary();
}
async function loadCheckout() {
  const [productResponse, shippingResponse] = await Promise.all([fetch("/api/products"), fetch("/api/shipping")]);
  if (!productResponse.ok) throw new Error("Não foi possível carregar o catálogo. Atualize a página.");
  products = await productResponse.json();
  if (!products.length) throw new Error("Não há produtos disponíveis para compra.");
  if (!shippingResponse.ok) {
    const data = await shippingResponse.json().catch(() => ({}));
    throw new Error(data.detail || "O frete ainda não foi configurado pela loja.");
  }
  shipping = await shippingResponse.json();
  // Cartão/Mercado Pago só aparece quando a loja tem o gateway configurado.
  mpOption.hidden = !(shipping.payment_methods && shipping.payment_methods.mercadopago);
  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = String(product.id);
    option.textContent = `${product.name} — ${money(product.price_cents)}${product.stock < 1 ? " (esgotado)" : ""}`;
    productSelect.append(option);
  });
  const requestedId = Number(new URLSearchParams(location.search).get("product"));
  if (products.some((product) => product.id === requestedId)) productSelect.value = String(requestedId);
  loaded = true;
  updateSizes();
}

// ----- Máscaras e preenchimento automático -----
const digits = (value) => String(value || "").replace(/\D/g, "");
function maskPhone(value) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCep(value) {
  const d = digits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
const fields = checkoutForm.elements;
fields.telefone.addEventListener("input", () => { fields.telefone.value = maskPhone(fields.telefone.value); });
fields.estado.addEventListener("input", () => { fields.estado.value = fields.estado.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2); });
const cepHint = document.querySelector("#cep-hint");
const cepHintDefault = cepHint.textContent;
let lastCep = "";
fields.cep.addEventListener("input", async () => {
  fields.cep.value = maskCep(fields.cep.value);
  const cep = digits(fields.cep.value);
  if (cep.length !== 8 || cep === lastCep) return;
  lastCep = cep;
  cepHint.textContent = "(buscando endereço…)";
  try {
    // Preenchimento opcional: se o serviço falhar, a pessoa digita o endereço normalmente.
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (!response.ok || data.erro) throw new Error("CEP não encontrado");
    const street = [data.logradouro, data.bairro].filter(Boolean).join(" - ");
    if (street && !fields.endereco.value.trim()) fields.endereco.value = street;
    if (data.localidade && !fields.cidade.value.trim()) fields.cidade.value = data.localidade;
    if (data.uf && !fields.estado.value.trim()) fields.estado.value = data.uf;
    cepHint.textContent = "(endereço preenchido, confira e informe o número)";
    (fields.endereco.value ? fields.numero : fields.endereco).focus();
  } catch (_) {
    cepHint.textContent = "(não achamos esse CEP, preencha o endereço abaixo)";
  }
});

productSelect.addEventListener("change", updateSizes);
sizeSelect.addEventListener("change", refreshSummary);
quantityInput.addEventListener("input", refreshSummary);
checkoutForm.querySelectorAll('[name="payment_method"]').forEach((radio) => radio.addEventListener("change", refreshButton));
loadCheckout().catch((error) => { showError(error.message); loaded = false; refreshButton(); });

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const product = selectedProduct();
  if (!product || !shipping) return showError("O checkout não está disponível. Tente novamente mais tarde.");
  if (product.stock < 1) return showError("Este produto está sem estoque no momento.");
  if (digits(fields.cep.value).length !== 8) { fields.cep.focus(); return showError("Informe um CEP com 8 números."); }
  if (digits(fields.telefone.value).length < 10) { fields.telefone.focus(); return showError("Informe um telefone com DDD."); }
  if (!document.querySelector("#privacy-consent").checked) return showError("Marque a confirmação de leitura da Política de Privacidade para continuar.");
  const method = paymentMethod();
  submitting = true; submitButton.disabled = true;
  submitButton.textContent = method === "pix" ? "Criando seu pedido…" : "Preparando pagamento…";
  clearMessage();
  const form = new FormData(checkoutForm);
  const payload = {
    privacy_consent: true,
    payment_method: method,
    customer: {
      name: form.get("nome"), email: form.get("email"), phone: form.get("telefone"),
      address: form.get("endereco"), address_number: form.get("numero"), complement: form.get("complemento"),
      city: form.get("cidade"), state: form.get("estado"), postal_code: form.get("cep")
    },
    item: { product_id: product.id, quantity: Number(form.get("quantidade")), size: form.get("tamanho") || "" }
  };
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "Não foi possível criar o pedido. Tente novamente.");
    if (result.payment_method === "pix") {
      clearMessage("Pedido criado! Abrindo a chave PIX…");
      window.location.assign(`pedido.html?order=${encodeURIComponent(result.id)}&new=1`);
    } else {
      clearMessage(`Pedido ${result.id} criado. Redirecionando ao Mercado Pago…`);
      window.location.assign(result.checkout_url);
    }
  } catch (error) {
    showError(error.message || "Falha de comunicação. Verifique sua conexão e tente novamente.");
    submitting = false; refreshButton();
  }
});
