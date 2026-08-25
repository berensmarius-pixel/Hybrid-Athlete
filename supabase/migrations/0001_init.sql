-- Hybrid Athlete: Server-seitige Persistenz (KV-Dokument-Store)
-- Ausführen via Supabase Dashboard → SQL Editor oder Supabase MCP.

-- ─── 1. App-State Tabelle (JSONB Key-Value) ──────────────────────────────────
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_state is
  'Zentrale Persistenz der App-Slices (Spiegel der localStorage-Keys). Zugriff nur serverseitig via Service-Role-Key.';

-- updated_at automatisch pflegen
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_touch on public.app_state;
create trigger trg_app_state_touch
  before update on public.app_state
  for each row execute function public.touch_updated_at();

-- ─── 2. RLS: Clients dürfen NICHTS (deny-all), Service-Role umgeht RLS ───────
alter table public.app_state enable row level security;

-- Bewusst KEINE Policies angelegt: ohne Policy ist jeder Client-Zugriff
-- (anon / authenticated) verweigert. Der Server nutzt den Service-Role-Key,
-- welcher RLS bypassed.

-- ─── 3. Storage Buckets ──────────────────────────────────────────────────────
-- chat-images: private Buckets für Chat-Fotos (Zugriff nur via auth-gated Proxy)
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', false)
on conflict (id) do nothing;

-- Auch hier: keine Storage-Policies für Clients – Downloads laufen über die
-- auth-geschützte Proxy-Route /api/files/chat-images/[...path].
