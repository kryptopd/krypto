const money = (c) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const params = new URLSearchParams(location.search), id = params.get("order");
const labels = { aguardando_pagamento: "Aguardando pagamento", confirmado: "Pagamento confirmado", preparando: "Em preparação", enviado: "Enviado", entregue: "Entregue", cancelado: "Cancelado", expirado: "Expirado" };
const paymentLabels = { pending: "Pendente", approved: "Aprovado", rejected: "Recusado", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestação/chargeback" };
async function refresh() {
  if (!id) throw new Error("Código do pedido ausente.");
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Não foi possível consultar o pedido.");
  document.querySelector("#order-code").textContent = data.public_id;
  document.querySelector("#order-status").textContent = labels[data.status] || data.status;
  document.querySelector("#payment-status").textContent = paymentLabels[data.payment_status] || data.payment_status;
  document.querySelector("#order-subtotal").textContent = money(data.subtotal_cents);
  document.querySelector("#order-shipping").textContent = money(data.shipping_cents);
  document.querySelector("#order-total").textContent = money(data.total_cents);
  document.querySelector("#tracking").textContent = data.tracking_code ? `${data.shipping_provider || "Transportadora"}: ${data.tracking_code}` : "Será informado quando o pedido for enviado.";
  document.querySelector("#order-message").textContent = data.payment_status === "approved" ? "Pagamento confirmado. Obrigado por comprar na KRYPTO!" : data.status === "cancelado" || data.status === "expirado" ? "Este pedido não está ativo. Se houve cobrança, entre em contato com a loja." : "O status é atualizado após a confirmação enviada pelo Mercado Pago. Não feche a página de pagamento antes de concluir.";
}
refresh().catch((e) => { document.querySelector("#order-message").textContent = e.message; });
