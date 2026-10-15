-- BACK BOT v1.3.0 — Auto mensagens
-- Execute este arquivo no Supabase > SQL Editor, uma única vez.
create table if not exists public.ff_auto_messages (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text not null,
  message_type text not null default 'say' check (message_type in ('say', 'embed')),
  content text not null check (char_length(content) between 1 and 4000),
  role_id text null,
  interval_minutes integer not null default 60 check (interval_minutes between 5 and 525600),
  enabled boolean not null default true,
  next_run_at timestamptz not null default (now() + interval '60 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ff_auto_messages_due_idx
  on public.ff_auto_messages (enabled, next_run_at);
create index if not exists ff_auto_messages_guild_idx
  on public.ff_auto_messages (guild_id, created_at desc);

alter table public.ff_auto_messages enable row level security;
-- O bot deve usar SUPABASE_KEY de servidor (service_role), nunca a chave service_role no frontend.
-- Sem políticas públicas: clientes anon/authenticated não podem ler ou alterar estas mensagens.

-- Guarda o ID da última mensagem para substituir a anterior a cada envio.
alter table public.ff_auto_messages add column if not exists last_message_id text;
