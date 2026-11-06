const K = window.Krypto;
const { money, Cart } = K;
const $ = (s) => document.querySelector(s);
const form = $("#customer-form");
const fields = form.elements;
const feedback = $("#checkout-feedback");
const submitButton = form.querySelector('[type="submit"]');
const digits = (v) => String(v || "").replace(/\D/g, "");
const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (className) n.className = className;
  return n;
};

let products = [], info = null;
let savedAddress = null;      // dados da última compra, guardados só neste navegador
let confirmed = null;         // endereço que será usado neste pedido
let quote = null, quoteError = "", quoteSeq = 0, submitting = false;

function showError(message) { feedback.textContent = message; feedback.dataset.error = "true"; }
function clearMessage(message = "") { feedback.textContent = message; delete feedback.dataset.error; }
const paymentMethod = () => form.elements.payment_method.value;
const productById = (id) => products.find((p) => p.id === id);

// ---------- Sacola ----------
function lineState() {
  return Cart.lines().map((line) => {
    const product = productById(line.product_id);
    const unavailable = !product || product.stock < 1;
    const stockForProduct = product ? product.stock : 0;
    const qty = unavailable ? line.quantity : Math.min(line.quantity, stockForProduct, 10);
    return { line, product, unavailable, qty };
  });
}
const lineTotal = (state) => (state.product ? state.product.price_cents * state.qty : 0);

function renderItems() {
  const states = lineState();
  const box = $("#checkout-items"), sum = $("#summary-items");
  box.replaceChildren(); sum.replaceChildren();
  $("#empty-bag").hidden = states.length > 0;
  $("#checkout-grid").hidden = states.length === 0;
  if (!states.length) return;
  let qtyTotal = 0, subtotal = 0;
  states.forEach((st) => {
    const { line, product } = st;
    if (!st.unavailable && st.qty !== line.quantity) { Cart.setQuantity(line.product_id, line.size, st.qty); return; }
    qtyTotal += st.qty; subtotal += lineTotal(st);

    const row = el("div", undefined, "bag-item");
    const thumb = el("div", undefined, "bag-thumb");
    if (product) thumb.style.backgroundImage = `url("${product.image_url}")`;
    const info = el("div", undefined, "bag-info");
    info.append(el("strong", product ? product.name : "Produto indisponível"));
    if (st.unavailable) info.append(el("small", "Sem estoque. Remova para continuar.", "bag-warn"));
    else {
      info.append(el("small", [product.category, line.size ? `Tamanho ${line.size}` : ""].filter(Boolean).join(" · ")));
      const stepper = el("div", undefined, "stepper");
      const minus = el("button", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Diminuir quantidade");
      const plus = el("button", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Aumentar quantidade");
      const inBag = Cart.lines().filter((l) => l.product_id === product.id).reduce((n, l) => n + l.quantity, 0);
      plus.disabled = st.qty >= 10 || inBag >= product.stock;
      minus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, st.qty - 1));
      plus.addEventListener("click", () => Cart.setQuantity(line.product_id, line.size, st.qty + 1));
      stepper.append(minus, el("span", String(st.qty)), plus);
      info.append(stepper);
    }
    const side = el("div", undefined, "bag-side");
    if (product) side.append(el("strong", money(lineTotal(st))));
    const remove = el("button", "Remover", "bag-remove"); remove.type = "button";
    remove.addEventListener("click", () => Cart.remove(line.product_id, line.size));
    side.append(remove);
    row.append(thumb, info, side);
    box.append(row);

    const s = el("div", undefined, "summary-item");
    const t = el("div", undefined, "summary-thumb");
    if (product) t.style.backgroundImage = `url("${product.image_url}")`;
    const d = el("div"); d.append(el("strong", product ? product.name : "Indisponível"), el("small", `${line.size ? `Tam. ${line.size} · ` : ""}Qtd. ${st.qty}`));
    s.append(t, d, el("b", product ? money(lineTotal(st)) : ""));
    sum.append(s);
  });
  $("#summary-quantity").textContent = `${qtyTotal} ${qtyTotal === 1 ? "item" : "itens"}`;
  $("#summary-subtotal").textContent = money(subtotal);
  renderTotals(subtotal);
}

function renderTotals(subtotal) {
  if (subtotal === undefined) subtotal = lineState().reduce((n, st) => n + lineTotal(st), 0);
  const shipEl = $("#summary-shipping"), detail = $("#summary-ship-detail");
  detail.textContent = "";
  if (!confirmed) { shipEl.textContent = "Informe o endereço"; $("#summary-total").textContent = money(subtotal); return; }
  if (quoteError) { shipEl.textContent = "Indisponível"; $("#summary-total").textContent = money(subtotal); return; }
  if (!quote) { shipEl.textContent = "Calculando…"; $("#summary-total").textContent = money(subtotal); return; }
  shipEl.textContent = quote.shipping_cents ? money(quote.shipping_cents) : "Grátis";
  const parts = [`${confirmed.state}`];
  if (quote.days) parts.push(`até ${quote.days} dias`);
  detail.textContent = `(${parts.join(" · ")})`;
  $("#summary-total").textContent = money(subtotal + quote.shipping_cents);
}

// ---------- Frete (calculado no servidor) ----------
async function refreshQuote() {
  const seq = ++quoteSeq;
  quote = null; quoteError = "";
  const states = lineState().filter((st) => !st.unavailable);
  if (!confirmed || !states.length) return renderTotals();
  renderTotals();
  const itemsParam = states.map((st) => `${st.line.product_id}:${st.qty}`).join(",");
  try {
    const r = await fetch(`/api/shipping?state=${encodeURIComponent(confirmed.state)}&items=${encodeURIComponent(itemsParam)}`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (seq !== quoteSeq) return;
    if (!r.ok) throw new Error(data.detail || "Não foi possível calcular o frete.");
    quote = data;
  } catch (e) {
    if (seq !== quoteSeq) return;
    quoteError = e.message;
    showError(e.message);
  }
  renderTotals();
}

// ---------- Endereço ----------
function validAddress(a) {
  return a && typeof a === "object" && ["name", "email", "phone", "postal_code", "address", "address_number", "city", "state"].every((k) => String(a[k] || "").trim());
}
const formatCep = (v) => digits(v).replace(/^(\d{5})(\d{3})$/, "$1-$2");
function addressText(a) {
  return `${a.name} · ${a.phone}${a.email ? ` · ${a.email}` : ""}\n${a.address}, ${a.address_number}${a.complement ? ` — ${a.complement}` : ""}\n${a.city}/${a.state} · CEP ${formatCep(a.postal_code)}`;
}
function showSaved(address, isConfirmed) {
  $("#address-edit").hidden = true;
  $("#address-saved").hidden = false;
  $("#address-saved-text").textContent = addressText(address);
  $("#address-saved").classList.toggle("is-confirmed", isConfirmed);
  $("#address-ok").hidden = !isConfirmed;
  $("#address-question").textContent = isConfirmed ? "Endereço de entrega" : "Usar os dados da sua última compra?";
  $("#address-keep").hidden = isConfirmed;
}
function showEditor(banner, canCancel) {
  $("#address-saved").hidden = true;
  $("#address-edit").hidden = false;
  $("#address-banner").textContent = banner;
  $("#address-cancel").hidden = !canCancel;
  $("#address-feedback").textContent = "";
  (fields.nome.value ? fields.cep : fields.nome).focus();
}
function setConfirmed(address) {
  confirmed = address; quote = null; quoteError = "";
  clearMessage();
  showSaved(address, true);
  refreshQuote();
}

function readAddressForm() {
  return {
    name: fields.nome.value.trim(), email: fields.email.value.trim(), phone: fields.telefone.value.trim(), postal_code: digits(fields.cep.value),
    address: fields.endereco.value.trim(), address_number: fields.numero.value.trim(),
    complement: fields.complemento.value.trim(), city: fields.cidade.value.trim(), state: fields.estado.value.trim().toUpperCase()
  };
}
function addressProblem(a) {
  const fb = (field, message) => { field.focus(); return message; };
  if (a.name.length < 2) return fb(fields.nome, "Informe o nome de quem vai receber.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return fb(fields.email, "Informe um e-mail válido.");
  if (digits(a.phone).length < 10) return fb(fields.telefone, "Informe um telefone com DDD.");
  if (a.postal_code.length !== 8) return fb(fields.cep, "Informe um CEP com 8 números.");
  if (!a.address) return fb(fields.endereco, "Informe a rua e o bairro.");
  if (!a.address_number) return fb(fields.numero, "Informe o número.");
  if (!a.city) return fb(fields.cidade, "Informe a cidade.");
  if (!/^[A-Z]{2}$/.test(a.state)) return fb(fields.estado, "Informe o estado com a sigla (UF), por exemplo SP.");
  if (info && info.configured && Array.isArray(info.enabled_states) && !info.enabled_states.includes(a.state)) {
    return fb(fields.estado, `Ainda não entregamos no estado ${a.state}.`);
  }
  return "";
}

$("#address-keep").addEventListener("click", () => setConfirmed(savedAddress));
$("#address-change").addEventListener("click", () => {
  const previous = confirmed || savedAddress || {};
  confirmed = null; quote = null; quoteError = ""; quoteSeq++; clearMessage(); renderTotals();
  fields.nome.value = previous.name || fields.nome.value;
  fields.email.value = previous.email || fields.email.value;
  fields.telefone.value = previous.phone || fields.telefone.value;
  ["cep", "endereco", "numero", "complemento", "cidade", "estado"].forEach((n) => { fields[n].value = ""; });
  showEditor("Informe o novo endereço de entrega.", true);
});
$("#address-cancel").addEventListener("click", () => { if (savedAddress) showSaved(savedAddress, false); });
$("#address-save").addEventListener("click", () => {
  const fb = $("#address-feedback");
  const address = readAddressForm();
  const problem = addressProblem(address);
  if (problem) { fb.textContent = problem; fb.dataset.error = "true"; return; }
  fb.textContent = ""; delete fb.dataset.error;
  setConfirmed(address);
});

// Máscaras e busca de CEP
function maskPhone(value) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const maskCep = (v) => { const d = digits(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
fields.telefone.addEventListener("input", () => { fields.telefone.value = maskPhone(fields.telefone.value); });
fields.estado.addEventListener("input", () => { fields.estado.value = fields.estado.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2); });
const cepHint = $("#cep-hint"), cepHintDefault = cepHint.textContent;
let lastCep = "";
fields.cep.addEventListener("input", async () => {
  fields.cep.value = maskCep(fields.cep.value);
  const cep = digits(fields.cep.value);
  if (cep.length !== 8) { cepHint.textContent = cepHintDefault; lastCep = ""; return; }
  if (cep === lastCep) return;
  lastCep = cep;
  cepHint.textContent = "(buscando endereço…)";
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (!response.ok || data.erro) throw new Error("CEP não encontrado");
    const street = [data.logradouro, data.bairro].filter(Boolean).join(" - ");
    if (street) fields.endereco.value = street;
    if (data.localidade) fields.cidade.value = data.localidade;
    if (data.uf) fields.estado.value = data.uf;
    cepHint.textContent = "(endereço preenchido, confira e informe o número)";
    (fields.endereco.value ? fields.numero : fields.endereco).focus();
  } catch (_) {
    cepHint.textContent = "(não achamos esse CEP, preencha o endereço abaixo)";
  }
});

// ---------- Pagamento / botão ----------
function refreshButton() {
  submitButton.disabled = submitting;
  if (submitting) return;
  submitButton.innerHTML = paymentMethod() === "pix" ? 'Confirmar e ver chave PIX <span aria-hidden="true">↗</span>' : 'Ir para o pagamento <span aria-hidden="true">↗</span>';
  $("#secure-note-text").textContent = paymentMethod() === "pix"
    ? "Você verá a chave PIX logo após confirmar o pedido."
    : "Pagamento processado com segurança pelo Mercado Pago.";
}
form.querySelectorAll('[name="payment_method"]').forEach((r) => r.addEventListener("change", refreshButton));
window.addEventListener("krypto:cart", () => { renderItems(); refreshQuote(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const states = lineState();
  if (!states.length) return showError("Sua sacola está vazia.");
  if (states.some((st) => st.unavailable)) return showError("Há uma peça sem estoque na sacola. Remova-a para continuar.");
  if (!confirmed) {
    showError(savedAddress ? "Confirme se vamos entregar no endereço salvo ou troque o endereço." : "Informe e salve o endereço de entrega para continuar.");
    (savedAddress ? $("#address-saved") : $("#address-edit")).scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (quoteError || !quote) return showError(quoteError || "Aguarde o cálculo do frete e tente de novo.");
  if (!$("#privacy-consent").checked) return showError("Marque a confirmação de leitura da Política de Privacidade para continuar.");

  const method = paymentMethod();
  submitting = true; submitButton.disabled = true;
  submitButton.textContent = method === "pix" ? "Criando seu pedido…" : "Preparando pagamento…";
  clearMessage();
  try {
    const payload = {
      privacy_consent: true, payment_method: method, website: form.elements.website.value,
      customer: {
        name: confirmed.name, email: confirmed.email, phone: confirmed.phone, address: confirmed.address, address_number: confirmed.address_number,
        complement: confirmed.complement || "", city: confirmed.city, state: confirmed.state, postal_code: confirmed.postal_code
      },
      items: states.map((st) => ({ product_id: st.line.product_id, quantity: st.qty, size: st.line.size }))
    };
    const response = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "Não foi possível criar o pedido. Tente novamente.");
    Cart.clear();
    K.Orders.add(result.id);          // aparece em "Meus pedidos" neste aparelho
    K.Profile.write(confirmed);       // próxima compra já vem com os dados preenchidos
    if (result.payment_method === "pix") {
      clearMessage("Pedido criado! Abrindo a chave PIX…");
      location.assign(`pedido.html?order=${encodeURIComponent(result.id)}&new=1`);
    } else {
      clearMessage(`Pedido ${result.id} criado. Redirecionando ao Mercado Pago…`);
      location.assign(result.checkout_url);
    }
  } catch (error) {
    showError(error.message || "Falha de comunicação. Verifique sua conexão e tente novamente.");
    submitting = false; refreshButton();
  }
});

// ---------- Início ----------
(async function init() {
  try {
    const [list, infoResponse] = await Promise.all([K.loadProducts(true), fetch("/api/shipping", { cache: "no-store" })]);
    products = list;
    info = infoResponse.ok ? await infoResponse.json() : null;
  } catch (e) { showError("Não foi possível carregar a loja. Atualize a página."); return; }
  $("#mp-option").hidden = !(info && info.payment_methods && info.payment_methods.mercadopago);
  if (info && !info.configured) showError("A loja ainda não configurou o frete. Volte em breve.");

  const stored = K.Profile.read();
  savedAddress = validAddress(stored) ? stored : null;
  renderItems();
  if (savedAddress) showSaved(savedAddress, false);
  else showEditor("Informe seus dados e onde vamos entregar. Não precisa criar conta.", false);
  refreshButton();
})();
