# KRYPTO — loja virtual (Vercel + Supabase + Mercado Pago)

Este projeto implementa catálogo, checkout com criação de pedido, estoque reservado, pagamento Mercado Pago Checkout Pro, atualização de pagamento por webhook assinado, expiração de pedidos não pagos, consulta pública limitada do status, rastreamento manual e páginas-base de privacidade/termos.

## Antes de vender: configuração obrigatória

### 1. Banco de dados
- Em um projeto Supabase novo, execute `supabase/schema.sql` no SQL Editor.
- Se o banco já existe, faça backup e execute `supabase/migrations/20261029_commerce_lgpd.sql` no SQL Editor. A migração adiciona campos e funções, mas revise os dados atuais antes de aplicar em produção.
- Não exponha `SUPABASE_SERVICE_ROLE_KEY` no navegador.

### 2. Variáveis de ambiente da Vercel
Configure em Project Settings → Environment Variables, em todos os ambientes que for usar:

- `SUPABASE_URL`: URL do projeto.
- `SUPABASE_SERVICE_ROLE_KEY`: chave privada server-side.
- `MERCADOPAGO_ACCESS_TOKEN`: Access Token da aplicação Mercado Pago. Comece com credenciais de teste; use produção só depois de validar o fluxo.
- `MERCADOPAGO_WEBHOOK_SECRET`: chave secreta gerada nas configurações de Webhooks do Mercado Pago.
- `SITE_URL`: domínio HTTPS canônico da loja, sem barra no final (ex.: `https://sua-loja.vercel.app`).
- `KRYPTO_SHIPPING_CENTS`: frete fixo em centavos (ex.: `1990` = R$ 19,90; `0` = frete grátis).
- `KRYPTO_SHIPPING_NAME`: nome do método de frete mostrado no gateway (ex.: `Frete padrão`).
- `CRON_SECRET`: segredo aleatório para proteger a função de expiração de pedidos.
- `ADMIN_USERNAME` e `ADMIN_PASSWORD`: mantenha somente se as rotas atuais do projeto ainda dependem dessas variáveis.

Gere `CRON_SECRET` com `openssl rand -hex 32`. Não compartilhe tokens em mensagens nem os envie ao Git. Após configurar variáveis, faça redeploy.

### 3. Configurar o Mercado Pago
1. Crie uma aplicação em Mercado Pago Developers.
2. Use credenciais de teste primeiro.
3. Configure Webhooks para eventos de pagamento e a URL `https://SEU-DOMINIO/api/webhooks/mercadopago`.
4. Copie a chave secreta de Webhooks para `MERCADOPAGO_WEBHOOK_SECRET`.
5. Teste pagamento aprovado, recusado, pendente, cancelamento, notificação repetida e estorno.
6. Só então troque para credenciais de produção.

A aplicação verifica a assinatura do webhook e consulta o pagamento diretamente na API do Mercado Pago antes de atualizar o pedido. O retorno do navegador nunca é tratado como prova de pagamento.

### 4. Frete e entrega
Esta versão calcula **frete fixo configurável**, não cota automaticamente Correios/transportadoras. Defina `KRYPTO_SHIPPING_CENTS` com um valor que a operação consiga cumprir. O painel permite informar transportadora e rastreamento ao marcar o pedido como enviado. Para cotações reais, será necessário escolher um integrador/transportadora e configurar CEP de origem, peso e dimensões reais dos produtos.

### 5. LGPD e páginas comerciais
- Complete todos os campos `[PREENCHER ...]` em `privacidade.html`, `termos.html` e `trocas-devolucoes.html`.
- Configure canal de atendimento e canal para solicitações de titulares.
- Defina prazos reais de retenção e exclusão/anonimização, rotina de atendimento a solicitações e quem é o responsável pelo tratamento.
- A página de checkout registra que o cliente visualizou/confirmou a política; isso não substitui a análise da base legal adequada para cada finalidade.
- Os documentos são modelos operacionais e precisam ser revisados de acordo com a operação real. Não publique com campos em aberto.

### 6. Expiração e estoque
Pedidos aguardando pagamento reservam o estoque. Reservas com mais de 30 minutos são expiradas pela função SQL; a Vercel Cron executa a rotina diariamente (compatível com planos com agendamento limitado) e novas tentativas de checkout também executam a limpeza. Se o pagamento chegar depois da expiração, a integração tenta estornar automaticamente e registra erro nos logs se não conseguir.
Cancelamento de pedidos já pagos exige estorno no Mercado Pago; não entregue pedidos sem `payment_status=approved`.

### Autenticação administrativa
A implementação de autenticação foi mantida sem alterações neste pacote, conforme solicitado. Atenção: o arquivo original enviado (`api/_lib/supabase.js`) ainda contém verificação HTTP Basic com `ADMIN_USERNAME`/`ADMIN_PASSWORD`; não encontrei nesse ZIP um fluxo de login com Supabase Auth. Se a versão publicada já usa Supabase Auth, confirme que o código atualizado desse fluxo está no repositório antes de fazer deploy deste pacote, para não substituir sua implementação atual.

### 7. Rotas
- `GET /api/products`
- `GET /api/shipping`
- `POST /api/orders`
- `GET /api/orders/:id` (retorna status e valores, sem dados pessoais)
- `POST /api/webhooks/mercadopago`
- `GET /api/cron/expire-orders` (protegida por `CRON_SECRET`)
- Rotas administrativas já existentes para produtos e pedidos.

### 8. Testes obrigatórios antes de produção
- Compra com pagamento aprovado/recusado/pendente.
- Quantidade acima do estoque e duas compras concorrentes para o último item.
- Webhook com assinatura inválida e webhook repetido.
- Pagamento tardio depois de a reserva expirar.
- Cancelamento/estorno de pedido pago.
- Cadastro de transportadora/rastreamento.
- Revisão dos textos legais e política de retenção.

**Importante:** código preparado não significa que o gateway, a conta de vendedor, o domínio, as credenciais ou os textos legais estejam aprovados/configurados. Faça testes em sandbox antes de vender.
