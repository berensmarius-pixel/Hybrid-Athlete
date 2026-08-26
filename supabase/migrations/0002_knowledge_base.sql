-- Hybrid Athlete: Wissenschaftliche Wissensbasis (RAG) für den AI-Coach.
-- Vektor-Store für kuratierte Kernprinzipien + extrahierte PDF-Paper-Auszüge.
-- Zugriff ausschließlich serverseitig via Service-Role-Key (RLS deny-all).
-- Angewandt via Supabase MCP (Versionsname: knowledge_base).

-- ─── 1. pgvector aktivieren (im extensions-Schema, Supabase-Konvention) ──────
create extension if not exists vector with schema extensions;

-- ─── 2. Tabelle: Wissens-Chunks mit Embedding ────────────────────────────────
create table if not exists public.knowledge_chunks (
  id              text primary key,
  document_title  text not null,
  content         text not null,
  citation        jsonb,
  topics          text[] not null default '{}',
  kind            text not null default 'paper_extract',
  source_file     text,
  content_hash    text not null,
  embedding_model text not null,
  embedding       extensions.vector(768) not null,
  created_at      timestamptz not null default now()
);

comment on table public.knowledge_chunks is
  'RAG-Wissensbasis des AI-Coaches: semantische Chunks aus wissenschaftlichen Quellen (kuratierte Seeds + PDF-Extraktionen). Zugriff nur serverseitig via Service-Role-Key.';

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists knowledge_chunks_topics_idx
  on public.knowledge_chunks using gin (topics);

-- Dedupe: identischer Chunk-Text wird nicht doppelt gespeichert (Upsert).
create unique index if not exists knowledge_chunks_content_hash_key
  on public.knowledge_chunks (content_hash);

-- ─── 3. RLS: deny-all für Clients (Service-Role bypassed RLS) ────────────────
alter table public.knowledge_chunks enable row level security;
-- Bewusst KEINE Policies: identisches Schutzmodell wie public.app_state.

-- ─── 4. Similarity-Suche als RPC (Cosine) ────────────────────────────────────
-- Hinweis: `set search_path = public, extensions` ist Pflicht – der pgvector-
-- Operator <=> lebt im extensions-Schema (Fix-Migration knowledge_base_rpc_search_path).
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(768),
  match_count int default 5,
  min_similarity double precision default 0.35
)
returns table (
  id             text,
  document_title text,
  content        text,
  citation       jsonb,
  topics         text[],
  kind           text,
  similarity     double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    kc.id,
    kc.document_title,
    kc.content,
    kc.citation,
    kc.topics,
    kc.kind,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;

-- RPC nur für den Server (Service-Role) ausführbar:
revoke execute on function public.match_knowledge_chunks(extensions.vector(768), int, double precision)
  from anon, authenticated;
