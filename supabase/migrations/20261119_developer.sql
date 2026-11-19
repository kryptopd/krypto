-- Contas de desenvolvedor: liberam o "modo homologação" na loja (nada é gravado em produção).
-- A conta em si é criada à parte (senha nunca vai para o repositório).
alter table public.customers add column if not exists is_developer boolean not null default false;
