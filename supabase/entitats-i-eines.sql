-- =====================================================================
-- DEFENSEM · Entitats, sol·licituds d'adhesió i Eines (SQL complet, autònom)
-- Executa'l sencer a Supabase > SQL Editor > New query > Run.
-- Requereix l'esquema base (profiles i la funció rol_actual), que ja tens.
-- Es pot executar tantes vegades com calgui, encara que una part ja existeixi:
--   taules «if not exists», funcions «create or replace», «drop ... if exists» abans de cada
--   trigger, política i restricció, i el contingut inicial només s'insereix si no hi és.
-- No esborra ni modifica cap dada existent.
-- =====================================================================

-- ---------- 5. ENTITATS ADHERIDES ----------
-- Índex públic de les organitzacions que donen suport a la iniciativa (/entitats.html).
-- Només admin i editor en creen, editen, publiquen i esborren. La web pública només en veu les publicades.
-- El logo és una imatge del bucket «portades» (mateixa carpeta per persona que les portades) o, provisionalment,
-- una adreça https:// externa (quan no s'ha pogut pujar el fitxer).
create table if not exists public.entitats (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (char_length(nom) between 1 and 200),
  tipus       text not null check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','observatori','xarxa','altres')),
  municipi    text not null default '' check (char_length(municipi) <= 100),
  descripcio  text not null default '' check (char_length(descripcio) <= 600),
  web         text check (web is null or (char_length(web) <= 300 and web ~ '^https://\S+$')),
  instagram   text check (instagram is null or instagram ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$'),
  logo        text check (logo is null or logo ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
                      or (char_length(logo) <= 500 and logo ~ '^https://\S+$')),
  publicada   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entitats_publicada_idx on public.entitats (publicada, nom);
alter table public.entitats enable row level security;

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
drop trigger if exists gestionar_entitat_t on public.entitats;
create trigger gestionar_entitat_t before insert or update on public.entitats
  for each row execute function public.gestionar_entitat();

revoke all on public.entitats from anon, authenticated;
grant select (id, nom, tipus, municipi, descripcio, web, instagram, logo, publicada) on public.entitats to anon;
grant select, insert, update, delete on public.entitats to authenticated;

drop policy if exists ent_select_anon on public.entitats;
create policy ent_select_anon on public.entitats for select to anon using (publicada);
drop policy if exists ent_select on public.entitats;
create policy ent_select on public.entitats for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor'));
drop policy if exists ent_insert on public.entitats;
create policy ent_insert on public.entitats for insert to authenticated
  with check (public.rol_actual() in ('admin','editor'));
drop policy if exists ent_update on public.entitats;
create policy ent_update on public.entitats for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));
drop policy if exists ent_delete on public.entitats;
create policy ent_delete on public.entitats for delete to authenticated
  using (public.rol_actual() in ('admin','editor'));

-- ---------- 6. SOL·LICITUDS D'ADHESIÓ D'ENTITATS ----------
-- TANCADES (octubre 2026): el formulari públic «La teva entitat vol adherir-s'hi?» s'ha retirat i les entitats
-- només s'afegeixen des de l'app. La taula i les dades es conserven per si es recupera més endavant, però
-- ningú no hi pot inserir des de la web (sense permís d'inserció i amb una política restrictiva que ho nega).
-- Només admin i editor veuen les que ja hi ha (Supabase > Table Editor) i en canvien l'estat; només admin les esborra.
-- Si es tornés a obrir: grant insert (…) a anon/authenticated, política sol_insert with check (consentiment)
-- i esborrar la política sol_tancades. El trigger antispam (límit per correu i per hora) es manté.
create table if not exists public.sollicituds_entitats (
  id               uuid primary key default gen_random_uuid(),
  nom_entitat      text not null check (char_length(nom_entitat) between 1 and 200),
  tipus            text not null check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','observatori','xarxa','altres')),
  municipi         text not null check (char_length(municipi) between 1 and 100),
  descripcio       text not null default '' check (char_length(descripcio) <= 600),
  web              text check (web is null or (char_length(web) <= 300 and web ~ '^https?://\S+$')),
  instagram        text check (instagram is null or char_length(instagram) between 1 and 100),
  persona_contacte text not null check (char_length(persona_contacte) between 1 and 120),
  email            text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefon          text check (telefon is null or telefon ~ '^[0-9 +().-]{6,20}$'),
  missatge         text not null default '' check (char_length(missatge) <= 2000),
  consentiment     boolean not null check (consentiment),
  estat            text not null default 'nova' check (estat in ('nova','revisada','acceptada','descartada')),
  created_at       timestamptz not null default now()
);
create index if not exists sollicituds_entitats_data_idx on public.sollicituds_entitats (created_at desc);
alter table public.sollicituds_entitats enable row level security;

create or replace function public.gestionar_sollicitud()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.estat := 'nova'; new.created_at := now(); new.email := lower(trim(new.email));
    if (select count(*) from public.sollicituds_entitats
        where email = new.email and created_at > now() - interval '1 day') >= 3 then
      raise exception 'Ja hem rebut diverses sol·licituds amb aquest correu. Si cal, escriu-nos directament.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.sollicituds_entitats where created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Ara mateix rebem massa sol·licituds. Torna-ho a provar d''aquí a una estona.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists gestionar_sollicitud_t on public.sollicituds_entitats;
create trigger gestionar_sollicitud_t before insert on public.sollicituds_entitats
  for each row execute function public.gestionar_sollicitud();

-- Sense inserció des de la web. De les existents, només l'estat es pot canviar.
revoke all on public.sollicituds_entitats from anon, authenticated;
grant select, delete on public.sollicituds_entitats to authenticated;
grant update (estat) on public.sollicituds_entitats to authenticated;

drop policy if exists sol_insert on public.sollicituds_entitats;
drop policy if exists sol_tancades on public.sollicituds_entitats;
create policy sol_tancades on public.sollicituds_entitats as restrictive for insert to anon, authenticated
  with check (false);
drop policy if exists sol_select on public.sollicituds_entitats;
create policy sol_select on public.sollicituds_entitats for select to authenticated
  using (public.rol_actual() in ('admin','editor'));
drop policy if exists sol_update on public.sollicituds_entitats;
create policy sol_update on public.sollicituds_entitats for update to authenticated
  using (public.rol_actual() in ('admin','editor')) with check (public.rol_actual() in ('admin','editor'));
drop policy if exists sol_delete on public.sollicituds_entitats;
create policy sol_delete on public.sollicituds_entitats for delete to authenticated
  using (public.rol_actual() = 'admin');

-- ---------- 7. EINES (visors per analitzar el territori) ----------
-- Llista pública de /eines.html. Només admin i editor en creen, editen, ordenen, publiquen i esborren.
-- La web pública només en veu les publicades. L'URL ha de començar per https://.
create table if not exists public.eines (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (char_length(nom) between 1 and 200),
  organisme   text not null default '' check (char_length(organisme) <= 200),
  descripcio  text not null default '' check (char_length(descripcio) <= 600),
  url         text not null check (char_length(url) <= 500 and url ~ '^https://\S+$'),
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

-- ---------- 8. AMPLIACIONS (octubre 2026) ----------
-- Per a bases de dades creades abans: «create table if not exists» no canvia les restriccions d'una taula existent.
-- Tipus nous d'entitat (observatori, xarxa d'entitats), logo com a adreça https:// provisional i correcció dels
-- checks de web, correu i URL (versions anteriors: una repetició {1,300} que Postgres no admet i classes de caràcters POSIX
-- que donaven error en alguns editors SQL). Les expressions fan servir \S i \s.
alter table public.entitats drop constraint if exists entitats_web_check;
alter table public.entitats add constraint entitats_web_check
  check (web is null or (char_length(web) <= 300 and web ~ '^https://\S+$'));
alter table public.sollicituds_entitats drop constraint if exists sollicituds_entitats_web_check;
alter table public.sollicituds_entitats add constraint sollicituds_entitats_web_check
  check (web is null or (char_length(web) <= 300 and web ~ '^https?://\S+$'));
alter table public.sollicituds_entitats drop constraint if exists sollicituds_entitats_email_check;
alter table public.sollicituds_entitats add constraint sollicituds_entitats_email_check
  check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.eines drop constraint if exists eines_url_check;
alter table public.eines add constraint eines_url_check
  check (char_length(url) <= 500 and url ~ '^https://\S+$');
alter table public.entitats drop constraint if exists entitats_tipus_check;
alter table public.entitats add constraint entitats_tipus_check
  check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','observatori','xarxa','altres'));
alter table public.sollicituds_entitats drop constraint if exists sollicituds_entitats_tipus_check;
alter table public.sollicituds_entitats add constraint sollicituds_entitats_tipus_check
  check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','observatori','xarxa','altres'));
alter table public.entitats drop constraint if exists entitats_logo_check;
alter table public.entitats add constraint entitats_logo_check
  check (logo is null or logo ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
         or (char_length(logo) <= 500 and logo ~ '^https://\S+$'));

-- ---------- 9. CONTINGUT INICIAL (publicat; editable i esborrable des de l'àrea privada) ----------
-- «where not exists» en lloc de «on conflict»: el nom no és una clau única, i així no es dupliquen.
insert into public.entitats (nom, tipus, municipi, descripcio, web, logo, publicada)
select 'Observatori Energies Renovables de Catalunya (OBERCat)', 'observatori', '',
  'Fa el seguiment del desplegament de les energies renovables i l''eficiència energètica a Catalunya i n''avalua els avenços i retards respecte als objectius fixats pel Parlament, el Govern i la UE.',
  'https://observatorirenovables.cat/',
  'https://observatorirenovables.cat/wp-content/uploads/2021/06/OBERCat-transparent-min.png',
  true
where not exists (select 1 from public.entitats where nom = 'Observatori Energies Renovables de Catalunya (OBERCat)');

insert into public.entitats (nom, tipus, municipi, descripcio, web, logo, publicada)
select 'Xarxa Catalana per a una Transició Energètica Justa', 'xarxa', '',
  'Xarxa d''entitats, col·lectius i ciutadania que defensa una transició energètica justa i s''oposa al disseny actual del PLATER; impulsa al·legacions, debats i campanyes.',
  'https://transicioenergeticajusta.cat/',
  'https://transicioenergeticajusta.cat/wp-content/uploads/2022/12/cropped-Logo-Xarca-Catalana-per-a-una-Transicio-Energetica-Justa-1.png',
  true
where not exists (select 1 from public.entitats where nom = 'Xarxa Catalana per a una Transició Energètica Justa');

-- Eines
insert into public.eines (nom, organisme, descripcio, url, categoria, ordre, publicada)
select 'Vissir – ICGC', 'Institut Cartogràfic i Geològic de Catalunya',
  'Visor per consultar mapes topogràfics, geològics, temàtics i ortofotos de Catalunya.',
  'https://visors.icgc.cat/vissir/#loc=14.98/42.07814/3.05201', 'paisatge', 10, true
where not exists (select 1 from public.eines where nom = 'Vissir – ICGC');
