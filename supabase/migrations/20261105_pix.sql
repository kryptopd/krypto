-- KRYPTO: pagamento por chave PIX (confirmação manual no painel).
-- Execute no SQL Editor do Supabase ANTES de publicar esta versão. É seguro rodar mais de uma vez.

alter table public.orders add column if not exists payment_method text not null default 'mercadopago';
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('mercadopago', 'pix'));

-- Pedidos PIX mantêm o estoque reservado por 24 horas (dá tempo de o pagamento ser conferido).
-- Pedidos do Mercado Pago continuam expirando em 30 minutos.
create or replace function public.expire_krypto_orders()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype; v_item jsonb; v_count integer := 0;
begin
  for v_order in select * from public.orders
    where status='aguardando_pagamento' and payment_status in ('pending','rejected')
    and created_at < now() - case when payment_method = 'pix' then interval '24 hours' else interval '30 minutes' end
    and inventory_released=false
    for update skip locked
  loop
    for v_item in select value from jsonb_array_elements(v_order.items) loop
      update public.products set stock = stock + greatest(0, coalesce((v_item->>'quantity')::integer,0))
       where id = (v_item->>'product_id')::bigint;
    end loop;
    update public.orders set status='expirado', payment_status='expired', inventory_released=true, updated_at=now() where id=v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.expire_krypto_orders() from public, anon, authenticated;
grant execute on function public.expire_krypto_orders() to service_role;
