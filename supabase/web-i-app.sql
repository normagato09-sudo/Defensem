-- =====================================================================
-- DEFENSEM · Web per seccions i app de l'equip (octubre 2026)
-- Executa'l sencer a Supabase > SQL Editor > New query > Run.
-- Requereix l'esquema base, l'SQL d'Entitats i Eines i el de l'app (actes), que ja tens.
-- Només afegeix columnes, taules i permisos nous i el contingut inicial (si no hi és). No esborra cap dada.
-- Es pot executar tantes vegades com calgui.
-- =====================================================================

-- Funcions de dates i autoria (iguals que a l'esquema; es tornen a definir per si de cas).
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
create or replace function public.marca_actualitzat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();  -- la clau no es pot canviar: no hi ha permís d'UPDATE sobre aquesta columna
  return new;
end $$;

-- ---------- 12. PROJECTES (pàgines /projecte-la-tallada.html i /projecte-albons.html) ----------
-- Dos projectes fixos. Admin i editor n'editen el text, el mapa i la situació actual, i els publiquen o oculten.
create table if not exists public.projectes (
  id           text primary key check (id in ('la-tallada','albons')),
  titol        text not null check (char_length(titol) between 1 and 200),
  descripcio   text not null default '' check (char_length(descripcio) <= 10000),
  mapa         text check (mapa is null or mapa ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  mapa_enllac  text check (mapa_enllac is null or (char_length(mapa_enllac) <= 500 and mapa_enllac ~ '^https://\S+$')),
  situacio     text not null default '' check (char_length(situacio) <= 5000),
  publicada    boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.projectes enable row level security;
drop trigger if exists marca_projecte_t on public.projectes;
create trigger marca_projecte_t before insert or update on public.projectes
  for each row execute function public.marca_actualitzat();

revoke all on public.projectes from anon, authenticated;
grant select (id, titol, descripcio, mapa, mapa_enllac, situacio, publicada, updated_at) on public.projectes to anon;
grant select, update (titol, descripcio, mapa, mapa_enllac, situacio, publicada) on public.projectes to authenticated;

drop policy if exists proj_select_anon on public.projectes;
create policy proj_select_anon on public.projectes for select to anon using (publicada);
drop policy if exists proj_select on public.projectes;
create policy proj_select on public.projectes for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor','consulta'));
drop policy if exists proj_update on public.projectes;
create policy proj_update on public.projectes for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));

-- Contingut inicial: el que ja deia la web dels dos projectes (Qui som > El projecte). No es sobreescriu mai.
insert into public.projectes (id, titol, descripcio, situacio, publicada) values
  ('la-tallada', 'Aerogeneradors de La Tallada',
   'Quatre aerogeneradors de 200 metres d’alçada al pla de la Tallada d’Empordà (projectes «Pla de la Tallada I, II, III i IV»), davant del Montgrí, entre la Tallada, Tor, Bellcaire, Albons, Ullà i Verges.',
   '', true),
  ('albons', 'Aerogenerador d’Albons',
   'Un aerogenerador de 5 MW: torre de 121 metres i rotor de 158 metres de diàmetre. Fa uns 200 metres fins a la punta de la pala.' || E'\n\n' ||
   'Al paratge dels Salancs, una antiga zona d’estanyols i aiguamolls de la plana, entre el Montgrí i el Fluvià.' || E'\n\n' ||
   'Granges a uns 180 i 300 m, Can Virosquet a uns 510 m, Can Blanc (Can Bosc) a uns 710 m i el nucli d’Albons a 1,2 km. L’Escala queda a 1,8 km i Viladamat a 1,9 km.' || E'\n\n' ||
   'El promou Estabanell Generació, SLU, del grup Estabanell de Granollers. L’energia va a la xarxa elèctrica, no al consum dels pobles.',
   'En informació pública des del 25 de setembre de 2026 (DOGC núm. 9758), expedient FUE-2025-04857993.', true)
on conflict (id) do nothing;

-- ---------- 13. NOTÍCIES: SECCIÓ, MITJÀ, FONT, DATA I PROJECTE RELACIONAT ----------
-- «seccio»: Notícies de Defensem (defensem) o Notícies d'energies renovables (renovables).
-- Les de renovables porten mitjà, resum propi i l'adreça de la font (obligatòria per publicar-les).
alter table public.publicacions add column if not exists seccio text not null default 'defensem';
alter table public.publicacions add column if not exists mitja text not null default '';
alter table public.publicacions add column if not exists font_url text;
alter table public.publicacions add column if not exists data date;
alter table public.publicacions add column if not exists projecte text references public.projectes(id) on delete set null;
alter table public.publicacions drop constraint if exists publicacions_seccio_check;
alter table public.publicacions add constraint publicacions_seccio_check check (seccio in ('defensem','renovables'));
alter table public.publicacions drop constraint if exists publicacions_mitja_check;
alter table public.publicacions add constraint publicacions_mitja_check check (char_length(mitja) <= 120);
alter table public.publicacions drop constraint if exists publicacions_font_url_check;
alter table public.publicacions add constraint publicacions_font_url_check
  check (font_url is null or (char_length(font_url) <= 500 and font_url ~ '^https://\S+$'));
alter table public.publicacions drop constraint if exists publicacions_font_publicada_check;
alter table public.publicacions add constraint publicacions_font_publicada_check
  check (seccio <> 'renovables' or estat <> 'publicat' or font_url is not null);
create index if not exists publicacions_seccio_idx on public.publicacions (seccio, estat);

-- Vista pública: NOMÉS contingut publicat i sense dades internes (ni autor, ni notes de revisió).
-- «data» és la data de la notícia; si no se n'ha posat cap, la de publicació.
create or replace view public.publicacions_publiques as
  select id, tipus, titol, resum, contingut, imatge, published_at,
         seccio, mitja, font_url, coalesce(data, published_at::date) as data, projecte
  from public.publicacions where estat = 'publicat';
grant select on public.publicacions_publiques to anon, authenticated;

-- ---------- 14. INFORMACIÓ: DOCUMENTS PDF PÚBLICS (/documents.html) ----------
-- Fitxers al bucket públic «informacio» (només PDF, 20 MB com a màxim). Admin i editor en pugen i n'esborren.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('informacio', 'informacio', true, 20971520, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists informacio_select on storage.objects;
create policy informacio_select on storage.objects for select to authenticated using (
  bucket_id = 'informacio' and public.rol_actual() in ('admin','editor'));
drop policy if exists informacio_insert on storage.objects;
create policy informacio_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'informacio' and public.rol_actual() in ('admin','editor')
  and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists informacio_update on storage.objects;
create policy informacio_update on storage.objects for update to authenticated using (
  bucket_id = 'informacio' and public.rol_actual() in ('admin','editor'));
drop policy if exists informacio_delete on storage.objects;
create policy informacio_delete on storage.objects for delete to authenticated using (
  bucket_id = 'informacio' and public.rol_actual() in ('admin','editor'));

create table if not exists public.informacio (
  id          uuid primary key default gen_random_uuid(),
  titol       text not null check (char_length(titol) between 1 and 200),
  categoria   text not null check (char_length(categoria) between 1 and 80),
  data        date,
  fitxer      text not null check (fitxer ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' or fitxer ~ '^/docs/[a-z0-9-]{1,100}\.pdf$'),
  mida        bigint check (mida is null or mida between 0 and 52428800),
  projecte    text references public.projectes(id) on delete set null,
  publicada   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists informacio_publicada_idx on public.informacio (publicada, categoria);
alter table public.informacio enable row level security;
drop trigger if exists gestionar_informacio_t on public.informacio;
create trigger gestionar_informacio_t before insert or update on public.informacio
  for each row execute function public.gestionar_entitat();  -- mateixes dates i autoria que les entitats

revoke all on public.informacio from anon, authenticated;
grant select (id, titol, categoria, data, fitxer, mida, projecte, publicada) on public.informacio to anon;
grant select, insert, update, delete on public.informacio to authenticated;

drop policy if exists info_select_anon on public.informacio;
create policy info_select_anon on public.informacio for select to anon using (publicada);
drop policy if exists info_select on public.informacio;
create policy info_select on public.informacio for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor','consulta'));
drop policy if exists info_insert on public.informacio;
create policy info_insert on public.informacio for insert to authenticated
  with check (public.rol_actual() in ('admin','editor'));
drop policy if exists info_update on public.informacio;
create policy info_update on public.informacio for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));
drop policy if exists info_delete on public.informacio;
create policy info_delete on public.informacio for delete to authenticated
  using (public.rol_actual() in ('admin','editor'));

-- Contingut inicial: el fulletó del molí d'Albons que ja era a la web (/docs). No es duplica.
insert into public.informacio (titol, categoria, fitxer, mida, projecte, publicada)
select 'Fulletó del molí d’Albons', 'Fulletons', '/docs/fulleto-moli-salancs-albons.pdf', 817473, 'albons', true
where not exists (select 1 from public.informacio where fitxer = '/docs/fulleto-moli-salancs-albons.pdf');

-- ---------- 15. PÀGINES: TEXTOS DE QUI SOM I DEL PEU ----------
-- Textos fixos de la web que es poden canviar des de l'app (una línia en blanc separa paràgrafs).
-- Tothom els pot llegir; només admin i editor els modifiquen. No se'n creen ni se n'esborren des de l'app.
create table if not exists public.pagines (
  clau        text primary key check (clau in ('qui-som','el-projecte','peu-lema')),
  titol       text not null check (char_length(titol) between 1 and 120),
  contingut   text not null default '' check (char_length(contingut) <= 10000),
  ordre       int not null default 10,
  updated_at  timestamptz not null default now()
);
alter table public.pagines enable row level security;
drop trigger if exists marca_pagina_t on public.pagines;
create trigger marca_pagina_t before insert or update on public.pagines
  for each row execute function public.marca_actualitzat();

revoke all on public.pagines from anon, authenticated;
grant select (clau, titol, contingut, ordre, updated_at) on public.pagines to anon;
grant select, update (contingut) on public.pagines to authenticated;

drop policy if exists pag_select_anon on public.pagines;
create policy pag_select_anon on public.pagines for select to anon using (true);
drop policy if exists pag_select on public.pagines;
create policy pag_select on public.pagines for select to authenticated using (true);
drop policy if exists pag_update on public.pagines;
create policy pag_update on public.pagines for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));

-- Contingut inicial: els textos que ja hi ha a la web. No es sobreescriuen mai.
insert into public.pagines (clau, titol, contingut, ordre) values
  ('qui-som', 'Qui som: text',
   'Som una iniciativa ciutadana que defensa l’Empordanet: la seva terra, els seus conreus, els seus pobles i el seu paisatge. Ens mou l’estima pel lloc on vivim i la voluntat de preservar-lo per a les persones que vindran.' || E'\n\n' ||
   'Diem no al projecte de quatre aerogeneradors de 200 metres d’alçada al pla de la Tallada d’Empordà. Defensem la nostra terra, la natura, els conreus, la salut i l’economia local.' || E'\n\n' ||
   'No rebutgem les energies renovables. Creiem en una transició ecològica que sigui local, distribuïda i no especulativa, planificada amb transparència i amb la participació de la ciutadania.', 10),
  ('el-projecte', 'Qui som: introducció d’«El projecte»',
   'A l’Empordanet hi ha dos projectes eòlics en marxa i un pla de la Generalitat que en pot portar més. Això és el que en sabem.', 20),
  ('peu-lema', 'Peu de pàgina: lema',
   'Pensem en el que tenim, en el que som i en el que deixarem.', 30)
on conflict (clau) do nothing;
