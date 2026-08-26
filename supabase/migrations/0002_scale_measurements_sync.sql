-- Offline-First Scale Sync: Nutzer-Scope + Timestamp-Dedupe für scale_measurements.
-- Der Pi-Daemon puffert Messungen lokal (SQLite) und synchronisiert sie über
-- /api/metrics/weight nach. Dedupe erfolgt pro (user_id, measured_at), damit
-- Retry-/Batch-Syncs idempotent sind (Upsert statt Duplikate).

-- Single-User-Setup: alle Messungen gehören dem lokalen Athleten.
alter table public.scale_measurements
  add column if not exists user_id text not null default 'local';

-- Idempotenter Upsert-Konflikt-Zielindex (timestamp/user_id dedupe)
create unique index if not exists uq_scale_measurements_user_measured_at
  on public.scale_measurements (user_id, measured_at);

-- Schnelle "neueste N"-Abfragen des Frontends
create index if not exists idx_scale_measurements_user_recent
  on public.scale_measurements (user_id, measured_at desc);
