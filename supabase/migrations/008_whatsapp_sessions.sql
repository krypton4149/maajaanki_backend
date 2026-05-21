-- Persist WhatsApp cart/checkout state (Vercel serverless has no in-memory sessions)

create table if not exists public.whatsapp_sessions (
  whatsapp_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_sessions_updated_at_idx
  on public.whatsapp_sessions (updated_at desc);

comment on table public.whatsapp_sessions is 'Per-user WhatsApp ordering flow state (cart, catalog, phase).';

alter table public.whatsapp_sessions enable row level security;

drop policy if exists whatsapp_sessions_backend on public.whatsapp_sessions;
create policy whatsapp_sessions_backend on public.whatsapp_sessions
  for all
  using (true)
  with check (true);
