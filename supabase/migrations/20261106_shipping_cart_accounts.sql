-- KRYPTO: frete configurável (estado/peso/frete grátis), sacola com várias peças e contas de clientes.
-- Execute no SQL Editor do Supabase ANTES de publicar esta versão. É seguro rodar mais de uma vez.

-- 1) Peso de cada produto (em gramas), usado no cálculo do frete.
alter table public.products add column if not exists weight_grams integer not null default 300;
alter table public.products drop constraint if exists products_weight_grams_check;
alter table public.products add constraint products_weight_grams_check check (weight_grams >= 0 and weight_grams <= 100000);

-- 2) Pedido ligado à conta do cliente (Supabase Auth).
alter table public.orders add column if not exists user_id uuid;
create index if not exists orders_user_id_idx on public.orders(user_id);

-- 3) Configurações da loja (o frete é editado no painel administrativo, em "Frete e entrega").
create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;
-- Sem policies: só a service_role (funções da Vercel) lê e grava.

-- 4) Criação de pedido com várias peças. Trava os produtos em ordem de id (evita deadlock),
--    confere estoque/tamanho de cada linha e baixa o estoque na mesma transação.
create or replace function public.create_krypto_order_v2(
  p_customer jsonb, p_items jsonb, p_shipping_cents integer,
  p_privacy_acknowledged boolean default false, p_user_id uuid default null
)
returns table(public_id text, total_cents integer, subtotal_cents integer, shipping_cents integer, order_items jsonb)
language plpgsql security definer set search_path = public
as $$
declare
  v_line record;
  v_product public.products%rowtype;
  v_subtotal integer := 0;
  v_total integer;
  v_public_id text;
  v_items jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_shipping_cents is null or p_shipping_cents < 0 or p_shipping_cents > 1000000 then raise exception 'INVALID_SHIPPING'; end if;
  if p_privacy_acknowledged is distinct from true then raise exception 'PRIVACY_CONSENT_REQUIRED'; end if;

  for v_line in
    select (e->>'product_id')::bigint as product_id, coalesce(e->>'size', '') as size, (e->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) e
     order by 1, 2
  loop
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 10 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products where id = v_line.product_id and active = true for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product.stock < v_line.quantity then raise exception 'OUT_OF_STOCK'; end if;
    if cardinality(v_product.sizes) > 0 and not (v_line.size = any(v_product.sizes)) then raise exception 'INVALID_SIZE'; end if;
    update public.products set stock = stock - v_line.quantity where id = v_product.id;
    v_subtotal := v_subtotal + v_product.price_cents * v_line.quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.name, 'quantity', v_line.quantity, 'size', v_line.size,
      'unit_price_cents', v_product.price_cents, 'weight_grams', v_product.weight_grams
    ));
  end loop;

  v_total := v_subtotal + p_shipping_cents;
  insert into public.orders (
    customer_name, email, phone, address, address_number, complement, city, state, postal_code,
    items, subtotal_cents, shipping_cents, total_cents, status, payment_status,
    privacy_policy_acknowledged_at, privacy_policy_version, user_id
  ) values (
    left(trim(p_customer->>'name'),160), left(trim(p_customer->>'email'),254), left(trim(p_customer->>'phone'),40),
    left(trim(p_customer->>'address'),200), left(trim(p_customer->>'address_number'),30),
    left(coalesce(trim(p_customer->>'complement'),''),120), left(trim(p_customer->>'city'),100),
    left(trim(p_customer->>'state'),60), left(trim(p_customer->>'postal_code'),20),
    v_items, v_subtotal, p_shipping_cents, v_total, 'aguardando_pagamento', 'pending', now(), '1.0', p_user_id
  ) returning orders.public_id into v_public_id;

  return query select v_public_id, v_total, v_subtotal, p_shipping_cents, v_items;
end;
$$;
revoke all on function public.create_krypto_order_v2(jsonb,jsonb,integer,boolean,uuid) from public, anon, authenticated;
grant execute on function public.create_krypto_order_v2(jsonb,jsonb,integer,boolean,uuid) to service_role;
