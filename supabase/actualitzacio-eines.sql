-- =====================================================================
-- DEFENSEM · Actualització: EINES i esborrat d'entitats per a editors
-- Executa-ho a Supabase > SQL Editor > New query > Run, DESPRÉS de l'SQL d'Entitats.
-- Només crea coses noves (taula «eines») i canvia una sola política (qui pot esborrar entitats).
-- No esborra ni modifica cap dada. Es pot tornar a executar sense problemes.
-- =====================================================================

-- Funció de dates i autoria (ja existeix si vas executar l'SQL d'Entitats; aquí es torna a definir igual).
create or replace function public.gestionar_entitat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now(); new.updated_at := now();
  else
    new.id := old.id; new.created_by := old.created_by; new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end $$;

-- Entitats: ara l'Editor també pot esborrar-ne (abans només l'Administrador).
drop policy if exists ent_delete on public.entitats;
create policy ent_delete on public.entitats for delete to authenticated
  using (public.rol_actual() in ('admin','editor'));

-- ---------- 7. EINES (visors per analitzar el territori) ----------
-- Llista pública de /eines.html. Només admin i editor en creen, editen, ordenen, publiquen i esborren.
-- La web pública només en veu les publicades. L'URL ha de començar per https://.
create table if not exists public.eines (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (char_length(nom) between 1 and 200),
  organisme   text not null default '' check (char_length(organisme) <= 200),
  descripcio  text not null default '' check (char_length(descripcio) <= 600),
  url         text not null check (char_length(url) <= 500 and url ~ '^https://[^[:space:]]+$'),
  categoria   text not null check (categoria in ('urbanisme','energia','paisatge','medi_natural','altres')),
  ordre       integer not null default 0,
  publicada   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists eines_publicada_idx on public.eines (publicada, ordre);
alter table public.eines enable row level security;

drop trigger if exists gestionar_eina_t on public.eines;
create trigger gestionar_eina_t before insert or update on public.eines
  for each row execute function public.gestionar_entitat();  -- mateixes dates i autoria que les entitats

revoke all on public.eines from anon, authenticated;
grant select (id, nom, organisme, descripcio, url, categoria, ordre, publicada) on public.eines to anon;
grant select, insert, update, delete on public.eines to authenticated;

drop policy if exists eina_select_anon on public.eines;
create policy eina_select_anon on public.eines for select to anon using (publicada);
drop policy if exists eina_select on public.eines;
create policy eina_select on public.eines for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor'));
drop policy if exists eina_insert on public.eines;
create policy eina_insert on public.eines for insert to authenticated
  with check (public.rol_actual() in ('admin','editor'));
drop policy if exists eina_update on public.eines;
create policy eina_update on public.eines for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));
drop policy if exists eina_delete on public.eines;
create policy eina_delete on public.eines for delete to authenticated
  using (public.rol_actual() in ('admin','editor'));
