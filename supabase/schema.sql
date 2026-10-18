-- Executa-ho a Supabase > SQL Editor.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('support','volunteer','contact')),
  name text not null,
  email text not null,
  municipality text,
  message text,
  consent boolean not null check (consent),
  created_at timestamptz not null default now()
);
-- RLS activada i SENSE polítiques: ningú pot llegir ni escriure des del navegador.
-- Només el servidor, amb la clau service_role, hi accedeix.
alter table public.leads enable row level security;
