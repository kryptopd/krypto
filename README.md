# KRYPTO — loja virtual (Vercel + Supabase + PIX + Mercado Pago)


## Melhorias recentes da vitrine

- Filtros combináveis por categoria, preço máximo, disponibilidade e favoritos.
- Lista de favoritos persistida neste navegador.
- Visualização rápida do produto com galeria, descrição, tamanhos e estoque.
- Seção de peças vistas recentemente, persistida neste navegador.
- Indicador de progresso para frete grátis no carrinho quando houver valor mínimo configurado.
- Rodapé reorganizado com navegação, ajuda e páginas legais.
- Pagamentos exibidos dinamicamente conforme as credenciais reais configuradas no servidor.

Favoritos, histórico de visualização e carrinho são locais ao navegador; ainda não são sincronizados entre dispositivos ou contas.

## Fotos enviadas pelo painel, tamanhos M/G/GG/G1 e categorias (novo)

- **Fotos sem URL:** em *Produtos*, o admin escolhe até **4 fotos** do celular/computador. A página reduz cada foto (máx. 1400 px, JPEG) e envia para o **Supabase Storage** (pasta pública `product-images`, criada sozinha no primeiro envio se não existir). A primeira foto é a capa (usada na sacola e no checkout); dá para reordenar com ◀ ▶ e remover. Fotos retiradas de um produto são apagadas do Storage ao salvar.
- **Vitrine:** cada peça mostra todas as fotos (arrastar no celular, setas e bolinhas no computador).
- **Tamanhos:** botões **M, G, GG, G1** (nenhum marcado = tamanho único, ex.: acessórios). A API só aceita esses quatro. Produtos antigos com outros tamanhos (ex.: P) continuam vendendo até serem editados.
- **Etiqueta:** campo removido (do painel, da API e da vitrine). A coluna `tag` continua no banco, sem uso.
- **Categorias:** nova aba **Categorias** no painel (criar e apagar). Cada peça escolhe uma categoria no cadastro (ou "Sem categoria"). Apagar uma categoria **não** apaga as peças: elas ficam sem categoria. A vitrine mostra como filtro só as categorias que têm peça.
- **Limite de funções da Vercel (plano gratuito = 12):** produtos, categorias e envio de fotos foram juntados em **uma** função, `api/admin/catalog.js` (`?r=products|categories|upload`), e a lista pública de categorias é `GET /api/products?categories=1`. Os arquivos `api/admin/products.js` e `api/admin/products/[id].js` foram removidos; o projeto passou de 12 para 11 funções.
- **Migração obrigatória:** execute `supabase/migrations/20261107_photos_sizes_categories.sql` no SQL Editor (cria `images`, a tabela `categories`, libera categorias novas e cria a pasta de fotos). Sem ela o painel abre, mas avisa e recusa salvar produtos; a vitrine segue funcionando com a foto única.

## Compra sem cadastro, "Meus pedidos" e PIX com valor preenchido (novo)

- **Sem conta de cliente:** o cliente não cria mais login no Supabase Auth, então não consome o limite de usuários. O checkout pede nome, e-mail, telefone e endereço; esses dados vão só no pedido (uma linha na tabela `orders`, apenas de quem realmente compra). O Supabase Auth continua sendo usado **somente pelo admin**.
- **Painel "Meus pedidos"** (`conta.html`): lista os pedidos feitos naquele aparelho, separados em *Em andamento* e *Finalizados*, com barra de etapas (Pedido → Pago → Preparando → A caminho → Entregue) e rastreio. Atualiza sozinho a cada 30 s. Os códigos dos pedidos ficam no `localStorage` do navegador; em outro aparelho o cliente recupera **todos os pedidos** com **e-mail + telefone** usados na compra (`POST /api/orders/lookup` com `{ email, phone }`; sem código e sem variável de ambiente nova). O telefone é comparado por DDD + últimos 8 dígitos, a resposta de erro é a mesma para "e-mail inexistente" e "telefone diferente", e há limite simples de tentativas por IP. Em `pedido.html` há também **"Enviar link no WhatsApp"** e **"Copiar link do pedido"** para abrir o pedido direto em outro aparelho. O formato antigo `{ email, code }` continua aceito pela API.
- **PIX Copia e Cola com valor:** o pedido gera um código PIX (BR Code) com o total já embutido (`api/_lib/pix.js`), mais QR Code. Ao colar no app do banco, o valor aparece preenchido (ex.: 3 peças = R$ 300,00). A chave simples continua disponível como alternativa. Não usa serviço externo nem banco de dados.
- Variáveis opcionais na Vercel: `PIX_MERCHANT_NAME` (nome do recebedor, até 25 caracteres, padrão `KRYPTO`) e `PIX_MERCHANT_CITY` (cidade, até 15 caracteres, padrão `BRASIL`). Use o nome/cidade da conta que recebe o PIX.
- Proteções sem login: campo isca anti-robô e limite de 3 pedidos PIX/aguardando pagamento por e-mail.
- Não precisa de nova migração SQL. A confirmação do PIX continua manual no painel admin.
- Atualize `privacidade.html`: a loja guarda os dados do pedido e o navegador do cliente guarda os códigos dos pedidos e o último endereço.

## Pagamento por PIX

O checkout oferece **PIX** quando `PIX_KEY` estiver configurada e, se `MERCADOPAGO_ACCESS_TOKEN` estiver configurado, também **cartão/outros via Mercado Pago**. Os meios indisponíveis são ocultados automaticamente.

- Depois de confirmar o pedido, o cliente vai para `pedido.html`, que mostra o valor exato, a chave PIX com botão de copiar e o passo a passo. A página se atualiza sozinha.
- Configure `PIX_KEY` nas variáveis de ambiente da Vercel com a chave PIX real da empresa. A loja não usa mais uma chave padrão embutida no código; sem `PIX_KEY`, PIX fica indisponível no checkout.
- Como a chave PIX é estática, **não há confirmação automática**: confira o valor no app do banco e clique em **Confirmar PIX** no painel (`admin.html`) no pedido correspondente. Só depois o pedido pode ser preparado/enviado.
- Pedidos PIX sem pagamento mantêm o estoque reservado por **24 horas** (Mercado Pago continua em 30 minutos). Para mudar, edite `expire_krypto_orders` em `supabase/migrations/20261105_pix.sql`.
- **Obrigatório antes de publicar esta versão:** execute `supabase/migrations/20261105_pix.sql` no SQL Editor do Supabase. Sem ela, pedidos PIX são recusados com uma mensagem amigável.

Este projeto implementa catálogo, checkout com criação de pedido, estoque reservado, pagamento Mercado Pago Checkout Pro, atualização de pagamento por webhook assinado, expiração de pedidos não pagos, consulta pública limitada do status, rastreamento manual e páginas-base de privacidade/termos.

## Antes de vender: configuração obrigatória

### 1. Banco de dados
- Em um projeto Supabase novo, execute `supabase/schema.sql` no SQL Editor.
- Se o banco já existe, faça backup e execute `supabase/migrations/20261029_commerce_lgpd.sql`, `20261105_pix.sql`, `20261106_shipping_cart_accounts.sql` e `20261107_photos_sizes_categories.sql` no SQL Editor. A migração adiciona campos e funções, mas revise os dados atuais antes de aplicar em produção.
- Não exponha `SUPABASE_SERVICE_ROLE_KEY` no navegador.

### 2. Variáveis de ambiente da Vercel
Configure em Project Settings → Environment Variables, em todos os ambientes que for usar:

- `SUPABASE_URL`: URL do projeto.
- `SUPABASE_SERVICE_ROLE_KEY`: chave privada server-side.
- `MERCADOPAGO_ACCESS_TOKEN`: Access Token da aplicação Mercado Pago. Comece com credenciais de teste; use produção só depois de validar o fluxo.
- `MERCADOPAGO_WEBHOOK_SECRET`: chave secreta gerada nas configurações de Webhooks do Mercado Pago.
- `SITE_URL`: domínio HTTPS canônico da loja, sem barra no final (ex.: `https://sua-loja.vercel.app`).
- `PIX_KEY` (obrigatória para aceitar PIX): chave PIX real que recebe os pagamentos. Sem ela, o PIX é ocultado no checkout.
- `CRON_SECRET`: segredo aleatório para proteger a função de expiração de pedidos.
- `SUPABASE_ANON_KEY`: chave publicável/anon para o formulário de login do Supabase Auth.
- `ADMIN_EMAILS`: e-mail(s) autorizado(s) a administrar a loja, separados por vírgula (ex.: `voce@exemplo.com`). Precisa corresponder ao e-mail cadastrado em Supabase → Authentication → Users.

Gere `CRON_SECRET` com `openssl rand -hex 32`. Não compartilhe tokens em mensagens nem os envie ao Git. Após configurar variáveis, faça redeploy.

### 3. Configurar o Mercado Pago
1. Crie uma aplicação em Mercado Pago Developers.
2. Use credenciais de teste primeiro.
3. Configure Webhooks para eventos de pagamento e a URL `https://SEU-DOMINIO/api/webhooks/mercadopago`.
4. Copie a chave secreta de Webhooks para `MERCADOPAGO_WEBHOOK_SECRET`.
5. Teste pagamento aprovado, recusado, pendente, cancelamento, notificação repetida e estorno.
6. Só então troque para credenciais de produção.

A aplicação verifica a assinatura do webhook e consulta o pagamento diretamente na API do Mercado Pago antes de atualizar o pedido. O retorno do navegador nunca é tratado como prova de pagamento.

### 4. Frete e entrega (agora no painel)
As variáveis `KRYPTO_SHIPPING_CENTS` e `KRYPTO_SHIPPING_NAME` **foram removidas** (pode apagá-las da Vercel). O frete é configurado em **admin → "Cálculo do frete"**:

- **Por estado:** entrega ligada/desligada, frete grátis no estado, valor base (R$), valor por kg extra (R$) e prazo (dias). Há um botão para aplicar valores a todos os estados.
- **Por peso:** cada produto tem um **peso em gramas** (campo no cadastro). Peso do pedido = soma das peças + peso da embalagem. Até o "peso coberto pelo valor base" cobra só o valor base; acima disso soma o valor por kg extra, por kg começado.
- **Frete grátis:** para todos os pedidos (chave geral), por estado, ou a partir de um valor de compra.
- O painel tem um **simulador**. O cálculo é feito no servidor (`api/_lib/shipping.js`); o navegador nunca envia o valor.
- Enquanto o frete não for salvo pela primeira vez, o checkout avisa que o frete não está configurado (o painel mostra valores sugeridos por região para você revisar e salvar).

Não cota Correios/transportadoras em tempo real; são tabelas suas. O painel continua permitindo informar transportadora e rastreamento.

### Contas de clientes, sacola e acesso ao painel
- A vitrine tem **sacola** (várias peças). "Fazer compra" leva a `conta.html` (abas Entrar / Cadastrar) se a pessoa não estiver logada; logada, vai ao checkout, que pergunta se quer usar o endereço salvo ou trocar (ou pede um, se não houver). O endereço fica nos metadados do usuário no Supabase Auth.
- Em Supabase → Authentication, se "Confirm email" estiver ligado, o cliente precisa confirmar o e-mail antes de comprar (a tela avisa). Configure também a URL do site em Authentication → URL Configuration.
- **Acesso ao admin:** não há mais botão visível. Na loja, clique **5 vezes seguidas no "©"** do rodapé (ou abra `/admin.html`). A segurança continua sendo o login + `ADMIN_EMAILS`; o e-mail do admin precisa estar confirmado no Supabase.
- **Migração obrigatória:** execute `supabase/migrations/20261106_shipping_cart_accounts.sql` no SQL Editor antes de publicar (cria peso dos produtos, `store_settings`, vínculo pedido↔cliente e a função de pedido com várias peças).

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
- `GET /api/shipping` (info pública) e `GET /api/shipping?state=SP&items=1:2` (cotação); `PUT` (admin) salva as regras
- `POST /api/orders` (exige cliente logado; `items` com várias peças)
- `GET /api/orders/:id` (retorna status e valores, sem dados pessoais)
- `POST /api/webhooks/mercadopago`
- `GET /api/cron/expire-orders` (protegida por `CRON_SECRET`)
- `GET /api/products?categories=1` (categorias da loja)
- Rotas administrativas: `/api/admin/catalog` (produtos, categorias e fotos), `/api/admin/dashboard` e `/api/admin/orders/:id`.

### 8. Testes obrigatórios antes de produção
- Compra com pagamento aprovado/recusado/pendente.
- Quantidade acima do estoque e duas compras concorrentes para o último item.
- Webhook com assinatura inválida e webhook repetido.
- Pagamento tardio depois de a reserva expirar.
- Cancelamento/estorno de pedido pago.
- Cadastro de transportadora/rastreamento.
- Revisão dos textos legais e política de retenção.

**Importante:** código preparado não significa que o gateway, a conta de vendedor, o domínio, as credenciais ou os textos legais estejam aprovados/configurados. Faça testes em sandbox antes de vender.

## Login do painel administrativo com Supabase Auth

O painel `/admin.html` autentica por e-mail e senha usando Supabase Auth. Para configurar na Vercel, em **Settings → Environment Variables**, defina:

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_ANON_KEY`: chave publicável/anon do projeto (pode ser usada no navegador).
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta usada somente nas funções de servidor. Nunca a coloque no HTML, JS público ou repositório.
- `ADMIN_EMAILS`: lista separada por vírgulas dos e-mails que podem administrar a loja, por exemplo `voce@exemplo.com`. O endereço deve ser o mesmo da conta em **Supabase → Authentication → Users**.

Depois de salvar as variáveis, faça novo deploy na Vercel. Usuários cadastrados no Supabase Auth só entram no painel se o e-mail também estiver listado em `ADMIN_EMAILS`. Se mudar o e-mail autorizado, atualize essa variável e redeploy. A chave `SUPABASE_ANON_KEY` não concede privilégios administrativos por si só; todas as APIs administrativas validam o token no servidor e verificam a lista permitida.
