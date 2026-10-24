-- =====================================================================
-- DEFENSEM · Formulari de contacte (taula «missatges_contacte»)
-- Executa'l sencer a Supabase > SQL Editor > New query > Run.
-- Requereix l'esquema base (la funció rol_actual), que ja tens. Només crea coses noves:
-- no toca cap altra taula ni cap dada. Es pot executar tantes vegades com calgui.
-- =====================================================================

-- ---------- 10. MISSATGES DEL FORMULARI DE CONTACTE ----------
-- Formulari públic de /contacte.html. Qualsevol pot enviar-ne (sense llegir res);
-- només admin i editor els veuen i en canvien l'estat; només admin els esborra.
-- Antispam a la base de dades: màxim 3 missatges per correu i dia i 30 per hora en total
-- (el navegador hi afegeix un camp parany i un temps mínim d'emplenament).
create table if not exists public.missatges_contacte (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null check (char_length(nom) between 1 and 120),
  email         text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  missatge      text not null check (char_length(missatge) between 1 and 4000),
  consentiment  boolean not null check (consentiment),
  estat         text not null default 'nou' check (estat in ('nou','llegit','respost')),
  created_at    timestamptz not null default now()
);
create index if not exists missatges_contacte_data_idx on public.missatges_contacte (created_at desc);
alter table public.missatges_contacte enable row level security;

create or replace function public.gestionar_missatge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.estat := 'nou'; new.created_at := now(); new.email := lower(trim(new.email));
  if (select count(*) from public.missatges_contacte
      where email = new.email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Ja hem rebut diversos missatges amb aquest correu. Et respondrem tan aviat com puguem.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.missatges_contacte where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Ara mateix rebem massa missatges. Torna-ho a provar d''aquí a una estona.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists gestionar_missatge_t on public.missatges_contacte;
create trigger gestionar_missatge_t before insert on public.missatges_contacte
  for each row execute function public.gestionar_missatge();

-- Inserció sense lectura (el navegador envia amb «Prefer: return=minimal»). Dels existents, només l'estat es pot canviar.
revoke all on public.missatges_contacte from anon, authenticated;
grant insert (nom, email, missatge, consentiment) on public.missatges_contacte to anon, authenticated;
grant select, delete on public.missatges_contacte to authenticated;
grant update (estat) on public.missatges_contacte to authenticated;

drop policy if exists msg_insert on public.missatges_contacte;
create policy msg_insert on public.missatges_contacte for insert to anon, authenticated
  with check (consentiment);
drop policy if exists msg_select on public.missatges_contacte;
create policy msg_select on public.missatges_contacte for select to authenticated
  using (public.rol_actual() in ('admin','editor'));
drop policy if exists msg_update on public.missatges_contacte;
create policy msg_update on public.missatges_contacte for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));
drop policy if exists msg_delete on public.missatges_contacte;
create policy msg_delete on public.missatges_contacte for delete to authenticated
  using (public.rol_actual() = 'admin');
