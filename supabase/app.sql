-- =====================================================================
-- DEFENSEM · App de la zona privada: agenda d'actes (taula «actes»)
-- Executa'l sencer a Supabase > SQL Editor > New query > Run.
-- Requereix l'esquema base i l'SQL d'Entitats (funcions rol_actual i gestionar_entitat), que ja tens.
-- Només crea coses noves i afegeix els 3 actes que ja eren a la web (si no hi són).
-- No toca cap altra taula ni cap dada. Es pot executar tantes vegades com calgui.
-- =====================================================================

-- Funció de dates i autoria (igual que la d'Entitats; es torna a definir per si de cas).
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

-- ---------- 11. AGENDA D'ACTES (gestionada des de l'app /app) ----------
-- Agenda pública d'/actualitat.html. Només admin i editor en creen, editen, publiquen, oculten i esborren.
-- La web pública només en veu els publicats. «quan» (opcional) és el text de la data tal com s'ha de mostrar
-- (p. ex. «22 i 23 de juliol del 2026 · 19.00 h»); si és buit, la web el fa a partir de data i hora.
-- El cartell és una imatge del bucket «portades» o un dels cartells de la web (/img/agenda/…).
create table if not exists public.actes (
  id          uuid primary key default gen_random_uuid(),
  titol       text not null check (char_length(titol) between 1 and 200),
  data        date not null,
  hora        time,
  data_fi     date,
  quan        text not null default '' check (char_length(quan) <= 120),
  lloc        text not null default '' check (char_length(lloc) <= 200),
  descripcio  text not null default '' check (char_length(descripcio) <= 2000),
  organitza   text not null default '' check (char_length(organitza) <= 300),
  cartell     text,
  publicada   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.actes drop constraint if exists actes_data_fi_check;
alter table public.actes add constraint actes_data_fi_check check (data_fi is null or data_fi >= data);
alter table public.actes drop constraint if exists actes_cartell_check;
alter table public.actes add constraint actes_cartell_check
  check (cartell is null or cartell ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' or cartell ~ '^/img/agenda/[a-z0-9-]{1,80}\.webp$');
create index if not exists actes_publicada_idx on public.actes (publicada, data);
alter table public.actes enable row level security;

drop trigger if exists gestionar_acte_t on public.actes;
create trigger gestionar_acte_t before insert or update on public.actes
  for each row execute function public.gestionar_entitat();  -- mateixes dates i autoria que les entitats

revoke all on public.actes from anon, authenticated;
grant select (id, titol, data, hora, data_fi, quan, lloc, descripcio, organitza, cartell, publicada) on public.actes to anon;
grant select, insert, update, delete on public.actes to authenticated;

drop policy if exists acte_select_anon on public.actes;
create policy acte_select_anon on public.actes for select to anon using (publicada);
drop policy if exists acte_select on public.actes;
create policy acte_select on public.actes for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor'));
drop policy if exists acte_insert on public.actes;
create policy acte_insert on public.actes for insert to authenticated
  with check (public.rol_actual() in ('admin','editor'));
drop policy if exists acte_update on public.actes;
create policy acte_update on public.actes for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));
drop policy if exists acte_delete on public.actes;
create policy acte_delete on public.actes for delete to authenticated
  using (public.rol_actual() in ('admin','editor'));

-- Contingut inicial: els tres actes que ja hi havia a l'agenda de la web (publicats). No es dupliquen.
insert into public.actes (titol, data, hora, data_fi, quan, lloc, descripcio, organitza, cartell, publicada)
select 'Caminada «Vine a veure-ho amb els teus propis ulls»', date '2026-10-24', time '09:00', null,
  'Dissabte 24 d’octubre del 2026 · 9.00 h', 'Pàrquing de la plaça de les Basses, Sant Jordi Desvalls (Gironès)',
  'Recorregut d’uns 5 km per l’entorn on es vol instal·lar el projecte fotovoltaic Julia: 52 MW en 4 zones i 93 hectàrees. Apte per a tothom; cal portar cantimplora. 10 € els adults (inclou esmorzar d’entrepà i poma) i gratuït fins a 12 anys. Inscripcions fins al 22 d’octubre a l’Ajuntament de Sant Jordi Desvalls i al Comerç Nonell.',
  'Mobilitzem la Llera (@mobilitzem_la_llera), amb la col·laboració de l’Ajuntament de Sant Jordi Desvalls.',
  '/img/agenda/caminada-projecte-julia.webp', true
where not exists (select 1 from public.actes where titol = 'Caminada «Vine a veure-ho amb els teus propis ulls»');

insert into public.actes (titol, data, hora, data_fi, quan, lloc, descripcio, organitza, cartell, publicada)
select 'Sessions pràctiques per fer al·legacions particulars al PLATER', date '2026-07-22', time '19:00', date '2026-07-23',
  '22 i 23 de juliol del 2026 · 19.00 h', 'Saló de Plens de l’Ajuntament de la Tallada d’Empordà',
  'Com utilitzar el visor cartogràfic del PLATER, com identificar les afectacions sobre la teva finca o el teu entorn i com incorporar-ho a les al·legacions particulars. A càrrec de Jaume Bosch.',
  'Associació Defensem l’Empordanet.', '/img/agenda/sessions-allegacions-plater.webp', true
where not exists (select 1 from public.actes where titol = 'Sessions pràctiques per fer al·legacions particulars al PLATER');

insert into public.actes (titol, data, hora, data_fi, quan, lloc, descripcio, organitza, cartell, publicada)
select 'Assemblea general oberta', date '2026-03-07', time '10:00', null,
  '7 de març del 2026 · 10.00 h', 'Local social de l’Empordanet',
  'Ordre del dia: el PLATER i el seu impacte al municipi (a votació), el macroparc eòlic de la Tallada, la comunitat energètica, l’estat i la consolidació de l’associació i les properes accions.',
  'Associació Defensem l’Empordanet.', '/img/agenda/assemblea-general-oberta.webp', true
where not exists (select 1 from public.actes where titol = 'Assemblea general oberta');
