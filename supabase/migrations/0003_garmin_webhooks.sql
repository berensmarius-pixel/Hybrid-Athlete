-- Hybrid Athlete: Garmin Push-Webhook Ingestion
-- Ereignis-Log (Idempotenz/Audit) + dedizierte Aktivitäts-Tabelle.
-- Ausführen via Supabase Dashboard → SQL Editor oder Supabase MCP.

-- ─── 1. Webhook-Ereignisse (Dedupe + Audit-Trail) ────────────────────────────
create table if not exists public.garmin_sync_events (
  id           uuid primary key default gen_random_uuid(),
  source       text        not null default 'garmin-push', -- Absender (garmin-push | manual-replay)
  data_type    text        not null,                       -- ACTIVITY_DETAILS | SLEEP | PULSE_OX | …
  event_key    text        not null unique,                -- Dedupe-Key (z. B. "ACTIVITY_DETAILS:<activityId>")
  activity_id  text,
  status       text        not null default 'received',    -- received|processing|processed|failed|skipped
  attempts     integer     not null default 0,
  error        text,
  payload      jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_garmin_sync_events_status
  on public.garmin_sync_events (status, received_at desc);

comment on table public.garmin_sync_events is
  'Eingegangene Garmin-Push-Events. event_key erzwingt Idempotenz (doppelte Webhooks werden übersprungen). Nur serverseitig via Service-Role-Key.';

-- ─── 2. Parsed Activities (Source of Truth für Load-Berechnung) ──────────────
create table if not exists public.garmin_activities (
  id                bigint primary key,              -- native Garmin Activity-ID
  user_id           text,
  name              text,
  sport             text,                            -- cycling | running | gym | other
  start_time        timestamptz,
  local_date        date,                            -- lokales Datum des Starts (YYYY-MM-DD)
  duration_seconds  integer,
  moving_duration_s integer,
  distance_meters   numeric,
  calories          integer,
  avg_hr            integer,
  max_hr            integer,
  avg_power_watts   numeric,
  max_power_watts   numeric,
  normalized_power  numeric,
  work_kj           numeric,
  tss               numeric,
  intensity_factor  numeric,
  avg_cadence       numeric,
  aerobic_te        numeric,                         -- Training Effect 0–5
  anaerobic_te      numeric,
  time_in_zones     jsonb,                           -- { hr: [...], power: [...] } Minuten je Zone
  planned_workout   jsonb,                           -- verknüpftes geplantes Workout (Titel/Beschreibung/Template)
  metrics           jsonb,                           -- vollständiger geparster Datensatz (Audit)
  debrief           text,                            -- AI-Kurzbrieferg (2-3 Saetze)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_garmin_activities_date
  on public.garmin_activities (local_date desc);

comment on table public.garmin_activities is
  'Geparste Garmin-Aktivitäten inkl. Leistungsmetriken (NP/TSS/IF/kJ/Zonen) und Planned-vs-Actual-Verknüpfung. Upsert via Webhook-Worker.';

drop trigger if exists trg_garmin_activities_touch on public.garmin_activities;
create trigger trg_garmin_activities_touch
  before update on public.garmin_activities
  for each row execute function public.touch_updated_at();

-- ─── 3. RLS: deny-all für Clients, Service-Role umgeht RLS ───────────────────
alter table public.garmin_sync_events enable row level security;
alter table public.garmin_activities enable row level security;
-- Bewusst KEINE Policies: anon/authenticated haben keinerlei Zugriff.
