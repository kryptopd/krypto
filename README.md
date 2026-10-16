# KRYPTO — pronto para testar na Vercel

O visual original foi mantido. Este pacote adiciona uma API de servidor para a loja funcionar com Supabase, em vez de deixar o frontend chamando `/api/...` sem backend.

## O que este pacote faz
- Catálogo público vindo do Supabase.
- Criação de pedido de teste e baixa de estoque com função SQL transacional.
- Painel admin para cadastrar, editar e desativar produtos e atualizar status de pedidos.
- Segredos do Supabase usados apenas nas funções server-side da Vercel.
- Produtos de exemplo opcionais no `supabase/schema.sql`.

> **Importante:** ainda é um protótipo. Não processa pagamento, não calcula frete e o painel usa autenticação Basic simples. Antes de vender de verdade, troque por autenticação robusta, proteção contra tentativas repetidas, política de privacidade/LGPD, logs e integração de pagamento.

## 1. Criar o banco
1. Crie um projeto no Supabase.
2. Abra **SQL Editor** e execute todo o arquivo `supabase/schema.sql`.
3. O script cria as tabelas, bloqueia acesso público direto por RLS e cria uma função segura para criar pedidos e atualizar estoque.

## 2. Publicar na Vercel
1. Coloque os arquivos deste pacote em um repositório Git (GitHub, por exemplo).
2. Importe o repositório na Vercel. Framework preset: **Other**.
3. Em **Project Settings → Environment Variables**, adicione:
   - `SUPABASE_URL`: URL do projeto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave `service_role` do projeto (segredo; nunca use em HTML/JS do navegador).
   - `ADMIN_USERNAME`: usuário do painel.
   - `ADMIN_PASSWORD`: senha longa e exclusiva para o painel.
4. Faça redeploy depois de adicionar as variáveis.
5. Abra o domínio da Vercel e teste a vitrine, checkout e `/admin.html`.

## 3. Testar localmente (opcional)
Requer Node.js instalado:
```bash
npm install
npx vercel login
npx vercel dev
```
Crie um `.env.local` com as mesmas quatro variáveis. Não envie `.env.local` ao Git.

## 4. Rotas incluídas
- `GET /api/products`
- `POST /api/orders`
- `GET /api/admin/dashboard`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id` (desativa sem apagar histórico)
- `PATCH /api/admin/orders/:id`

## Observações
- Pedidos guardam dados pessoais: use apenas dados fictícios nos testes.
- Não existe gateway de pagamento nesta versão.
- O checkout é de um produto por pedido, conforme o HTML atual.
- O botão do painel usa as credenciais de `ADMIN_USERNAME` e `ADMIN_PASSWORD`.
- Se a Vercel mostrar 500/503, veja **Functions → Logs** e confirme as variáveis de ambiente.
