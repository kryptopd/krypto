const money = (c) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const params = new URLSearchParams(location.search), id = params.get("order"), isNew = params.get("new") === "1";
const labels = { aguardando: "Aguardando pagamento", aguardando_pagamento: "Aguardando pagamento", confirmado: "Pagamento confirmado", preparando: "Em preparação", enviado: "A caminho", entregue: "Entregue", cancelado: "Cancelado", expirado: "Expirado" };
const paymentLabels = { pending: "Pendente", approved: "Aprovado", rejected: "Recusado", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestação/chargeback", expired: "Expirado" };
const steps = ["Pedido criado", "Pagamento confirmado", "Em preparação", "A caminho", "Entregue"];
const stepIndex = { aguardando: 0, aguardando_pagamento: 0, confirmado: 1, preparando: 2, enviado: 3, entregue: 4 };
const $ = (selector) => document.querySelector(selector);
let pollTimer = null, latest = null;

function renderProgress(status) {
  const box = $("#order-progress"), list = $("#progress-list");
  if (!(status in stepIndex)) { box.hidden = true; return; }
  const current = stepIndex[status];
  list.replaceChildren();
  steps.forEach((label, index) => {
    const item = document.createElement("li");
    item.textContent = label;
    if (index <= current) item.className = "done";
    if (index === current) { item.className = "done current"; item.setAttribute("aria-current", "step"); }
    list.append(item);
  });
  box.hidden = false;
}

function messageFor(data) {
  if (["cancelado", "expirado"].includes(data.status))
    return data.payment_method === "pix"
      ? "Este pedido não está mais ativo. Se você já fez o PIX, fale com a loja informando o código do pedido."
      : "Este pedido não está ativo. Se houve cobrança, entre em contato com a loja.";
  if (data.payment_status === "approved") return data.status === "enviado" ? "Seu pedido está a caminho. Obrigado por comprar na KRYPTO!" : "Pagamento confirmado. Obrigado por comprar na KRYPTO!";
  if (data.pix_key) return isNew ? "Pedido criado! Agora é só pagar com o PIX Copia e Cola abaixo: o valor já vai preenchido." : "Seu pedido está aguardando o pagamento por PIX.";
  return "O status é atualizado após a confirmação enviada pelo Mercado Pago. Não feche a página de pagamento antes de concluir.";
}

let qrDrawn = "";
function renderQr(payload) {
  const box = $("#pix-qr-box");
  if (!payload || typeof qrcode !== "function") { box.hidden = true; return; }
  if (qrDrawn === payload) { box.hidden = false; return; }
  try {
    const qr = qrcode(0, "M"); qr.addData(payload); qr.make();
    $("#pix-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    qrDrawn = payload; box.hidden = false;
  } catch (_) { box.hidden = true; }
}

// Conta a compra uma única vez por pedido (e só se a pessoa aceitou os cookies de análise).
function trackPurchase(data) {
  if (data.payment_status !== "approved" || !window.Krypto) return;
  const key = `krypto-purchase-${data.public_id}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch (_) { return; }
  window.Krypto.track("purchase", { value: data.total_cents / 100, transaction_id: data.public_id, items: (data.items || []).map((i) => ({ id: i.product_id, name: i.name, price: (i.unit_price_cents || 0) / 100, quantity: i.quantity })) });
}

function render(data) {
  latest = data;
  if (window.Krypto && window.Krypto.Orders) window.Krypto.Orders.add(data.public_id); // abrir o link já guarda em "Meus pedidos"
  $("#order-code").textContent = data.public_id;
  $("#order-code-eyebrow").textContent = `#${data.public_id}`;
  $("#order-created").textContent = data.created_at ? new Date(data.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  $("#order-status").textContent = labels[data.status] || data.status;
  $("#payment-status").textContent = (data.payment_method === "pix" ? "PIX · " : "") + (paymentLabels[data.payment_status] || data.payment_status);
  $("#order-subtotal").textContent = money(data.subtotal_cents);
  $("#order-discount-row").hidden = !data.discount_cents;
  $("#order-discount").textContent = data.discount_cents ? `− ${money(data.discount_cents)}` : "";
  trackPurchase(data);
  $("#review-cta").hidden = data.status !== "entregue";
  $("#review-cta").href = `avaliacoes.html?pedido=${encodeURIComponent(data.public_id)}`;
  $("#order-shipping").textContent = data.shipping_cents ? money(data.shipping_cents) : "Grátis";
  $("#order-total").textContent = money(data.total_cents);
  $("#tracking").textContent = data.tracking_code ? `${data.shipping_provider || "Transportadora"}: ${data.tracking_code}` : "Será informado quando o pedido for enviado.";
  $("#order-message").textContent = messageFor(data);
  const showPix = Boolean(data.pix_key);
  $("#pix-card").hidden = !showPix;
  if (showPix) {
    $("#pix-key").textContent = data.pix_key;
    $("#pix-payload").textContent = data.pix_payload || "";
    $("#copy-payload").hidden = !data.pix_payload;
    renderQr(data.pix_payload);
    $("#pix-amount").textContent = money(data.total_cents);
    $("#pix-amount-alt").textContent = money(data.total_cents);
    $("#pix-order-code").textContent = data.public_id;
    $("#pix-note").textContent = `Seu pedido fica reservado por ${data.pix_reserve_hours || 24} horas. Assim que identificarmos o pagamento, esta página muda para “Pagamento confirmado”. Pode fechar e voltar depois com o link deste pedido.`;
  }
  renderProgress(data.status);
  renderShare(data);
}

// Link limpo do pedido (sem ?new=1 e sem parâmetros de retorno do pagamento).
const orderLink = (publicId) => `${location.origin}${location.pathname}?order=${encodeURIComponent(publicId)}`;
function renderShare(data) {
  const box = $("#order-share");
  if (!data || !data.public_id) { box.hidden = true; return; }
  const link = orderLink(data.public_id);
  $("#share-whatsapp").href = `https://wa.me/?text=${encodeURIComponent(`Acompanhe meu pedido #${data.public_id} na KRYPTO: ${link}`)}`;
  box.hidden = false;
}
$("#share-copy").addEventListener("click", async () => {
  const fb = $("#share-feedback");
  if (!latest) return;
  const link = orderLink(latest.public_id);
  try { await navigator.clipboard.writeText(link); fb.textContent = "Link copiado! Abra no outro aparelho para acompanhar."; }
  catch (_) { fb.textContent = `Copie o link: ${link}`; }
  clearTimeout(fb.timer); fb.timer = setTimeout(() => { fb.textContent = ""; }, 5000);
});

async function refresh() {
  if (!id) throw new Error("Código do pedido ausente. Abra o link completo do seu pedido.");
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Não foi possível consultar o pedido.");
  render(data);
  schedule(data);
}
// Enquanto o pedido espera pagamento, confere o status sozinho a cada 20 segundos.
function schedule(data) {
  clearTimeout(pollTimer);
  if (["aguardando", "aguardando_pagamento"].includes(data.status)) {
    pollTimer = setTimeout(() => { if (!document.hidden) refresh().catch(() => {}); else schedule(data); }, 20000);
  }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && latest && ["aguardando", "aguardando_pagamento"].includes(latest.status)) refresh().catch(() => {}); });

async function copyText(text, okMessage) {
  const feedback = $("#copy-feedback");
  try {
    await navigator.clipboard.writeText(text);
    feedback.textContent = okMessage;
  } catch (_) {
    // Navegadores sem permissão de área de transferência: seleciona o texto para copiar à mão.
    const range = document.createRange(); range.selectNodeContents($(text === (latest && latest.pix_payload) ? "#pix-payload" : "#pix-key"));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    feedback.textContent = "Selecionamos o código. Toque e segure para copiar.";
  }
  clearTimeout(copyText.timer);
  copyText.timer = setTimeout(() => { feedback.textContent = ""; }, 4000);
}
$("#copy-payload").addEventListener("click", () => latest?.pix_payload && copyText(latest.pix_payload, "Código copiado! No app do banco, escolha Pix Copia e Cola e cole: o valor já vem preenchido."));
$("#copy-key").addEventListener("click", () => latest?.pix_key && copyText(latest.pix_key, "Chave copiada. Lembre de digitar o valor exato."));
$("#copy-amount").addEventListener("click", () => latest && copyText((latest.total_cents / 100).toFixed(2).replace(".", ","), "Valor copiado."));

refresh().catch((e) => { $("#order-message").textContent = e.message; $("#order-message").dataset.error = "true"; });
