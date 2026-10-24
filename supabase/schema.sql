-- =====================================================================
-- DEFENSEM · Àrea privada · Esquema de base de dades (Supabase / Postgres)
-- Executa aquest fitxer sencer a Supabase > SQL Editor > New query > Run.
-- És idempotent: es pot tornar a executar sense perdre dades.
-- La seguretat es fa AQUÍ (RLS + triggers), no al navegador.
-- =====================================================================

-- ---------- 1. PERFILS I ROLS ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nom        text not null default '',
  rol        text not null default 'consulta'
             check (rol in ('admin','editor','col_laborador','consulta')),
  actiu      boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Rol de l'usuari que fa la petició. NULL si no està identificat o el compte està desactivat.
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid() and actiu
$$;
revoke all on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;

-- Quan es crea un usuari a Auth, es crea el seu perfil SEMPRE amb el rol mínim.
-- (El rol real només el pot canviar un administrador.)
create or replace function public.nou_usuari()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nom)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data->>'nom', ''), 100))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.nou_usuari();

-- Proteccions: ningú canvia el seu propi rol/estat i mai no es pot quedar el sistema sense admin actiu.
create or replace function public.protegir_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare altres int;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    if auth.uid() is not null then
      new.email := old.email;
      if new.id = auth.uid() and (new.rol <> old.rol or new.actiu <> old.actiu) then
        raise exception 'No pots canviar el teu propi rol ni desactivar el teu compte.' using errcode = '42501';
      end if;
    end if;
  end if;
  if old.rol = 'admin' and old.actiu
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.actiu) then
    select count(*) into altres from public.profiles where rol = 'admin' and actiu and id <> old.id;
    if altres = 0 then
      raise exception 'Hi ha d''haver sempre almenys un administrador actiu.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protegir_perfil_t on public.profiles;
create trigger protegir_perfil_t before update or delete on public.profiles
  for each row execute function public.protegir_perfil();

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nom, rol, actiu) on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.rol_actual() = 'admin');
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- Noms (només el nom, mai el correu) perquè editors i admins sàpiguen qui ha escrit cada text.
create or replace view public.noms_usuaris as
  select id, nom from public.profiles where public.rol_actual() in ('admin','editor');
revoke all on public.noms_usuaris from anon, authenticated;
grant select on public.noms_usuaris to authenticated;

-- ---------- 2. PUBLICACIONS (notícies i comunicats) ----------
create table if not exists public.publicacions (
  id           uuid primary key default gen_random_uuid(),
  tipus        text not null check (tipus in ('noticia','comunicat')),
  titol        text not null check (char_length(titol) between 1 and 200),
  resum        text not null default '' check (char_length(resum) <= 500),
  contingut    text not null default '' check (char_length(contingut) <= 50000),
  imatge       text check (imatge is null or imatge ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  estat        text not null default 'esborrany'
               check (estat in ('esborrany','pendent','publicat','retornat','arxivat')),
  nota_revisio text check (nota_revisio is null or char_length(nota_revisio) <= 1000),
  autor_id     uuid not null references public.profiles(id),  -- sense cascade: desactivar no esborra res
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists publicacions_estat_idx on public.publicacions (estat, published_at desc);
create index if not exists publicacions_autor_idx on public.publicacions (autor_id);
alter table public.publicacions enable row level security;

create or replace function public.gestionar_publicacio()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := public.rol_actual();
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.updated_at := now();
    new.published_at := case when new.estat = 'publicat' then now() else null end;
  else
    new.id := old.id; new.autor_id := old.autor_id; new.created_at := old.created_at;
    new.updated_at := now();
    if r = 'col_laborador' then
      new.nota_revisio := old.nota_revisio;
      if new.estat <> old.estat and new.estat not in ('esborrany','pendent') then
        raise exception 'Un col·laborador només pot desar l''esborrany o enviar-lo a revisió.' using errcode = '42501';
      end if;
    end if;
    if new.estat = 'publicat' and old.estat <> 'publicat' then new.published_at := now();
    else new.published_at := old.published_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists gestionar_publicacio_t on public.publicacions;
create trigger gestionar_publicacio_t before insert or update on public.publicacions
  for each row execute function public.gestionar_publicacio();

revoke all on public.publicacions from anon, authenticated;
grant select, insert, update, delete on public.publicacions to authenticated;

drop policy if exists pub_select on public.publicacions;
create policy pub_select on public.publicacions for select to authenticated using (
  public.rol_actual() in ('admin','editor')
  or (public.rol_actual() = 'col_laborador' and autor_id = auth.uid()));

drop policy if exists pub_insert on public.publicacions;
create policy pub_insert on public.publicacions for insert to authenticated with check (
  autor_id = auth.uid() and (
    public.rol_actual() in ('admin','editor')
    or (public.rol_actual() = 'col_laborador' and estat in ('esborrany','pendent'))));

drop policy if exists pub_update on public.publicacions;
create policy pub_update on public.publicacions for update to authenticated
  using (
    public.rol_actual() in ('admin','editor')
    or (public.rol_actual() = 'col_laborador' and autor_id = auth.uid() and estat in ('esborrany','retornat')))
  with check (
    public.rol_actual() in ('admin','editor')
    or (public.rol_actual() = 'col_laborador' and autor_id = auth.uid() and estat in ('esborrany','pendent','retornat')));

drop policy if exists pub_delete on public.publicacions;
create policy pub_delete on public.publicacions for delete to authenticated
  using (public.rol_actual() = 'admin');

-- La vista pública (publicacions_publiques) es crea a la secció 13, quan ja hi ha totes les columnes.

-- ---------- 3. DOCUMENTS INTERNS (rol de consulta) ----------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  titol       text not null check (char_length(titol) between 1 and 200),
  descripcio  text not null default '' check (char_length(descripcio) <= 1000),
  enllac      text not null check (enllac ~ '^https://[^ ]+$'),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create table if not exists public.permisos_document (
  document_id uuid not null references public.documents(id) on delete cascade,
  usuari_id   uuid not null references public.profiles(id) on delete cascade,
  primary key (document_id, usuari_id)
);
alter table public.documents enable row level security;
alter table public.permisos_document enable row level security;
revoke all on public.documents, public.permisos_document from anon, authenticated;
grant select, insert, update, delete on public.documents, public.permisos_document to authenticated;

drop policy if exists doc_select on public.documents;
create policy doc_select on public.documents for select to authenticated using (
  public.rol_actual() = 'admin'
  or (public.rol_actual() is not null and exists (
        select 1 from public.permisos_document p
        where p.document_id = documents.id and p.usuari_id = auth.uid())));
drop policy if exists doc_admin_ins on public.documents;
create policy doc_admin_ins on public.documents for insert to authenticated
  with check (public.rol_actual() = 'admin');
drop policy if exists doc_admin_upd on public.documents;
create policy doc_admin_upd on public.documents for update to authenticated
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');
drop policy if exists doc_admin_del on public.documents;
create policy doc_admin_del on public.documents for delete to authenticated
  using (public.rol_actual() = 'admin');

drop policy if exists perm_select on public.permisos_document;
create policy perm_select on public.permisos_document for select to authenticated
  using (public.rol_actual() = 'admin' or (public.rol_actual() is not null and usuari_id = auth.uid()));
drop policy if exists perm_admin_ins on public.permisos_document;
create policy perm_admin_ins on public.permisos_document for insert to authenticated
  with check (public.rol_actual() = 'admin');
drop policy if exists perm_admin_del on public.permisos_document;
create policy perm_admin_del on public.permisos_document for delete to authenticated
  using (public.rol_actual() = 'admin');

-- ---------- 4. IMATGES DE PORTADA (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portades', 'portades', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Cada persona només pot pujar/modificar a la seva carpeta (nom de carpeta = el seu id).
-- SELECT cal perquè Postgres (i l'API de Storage) deixin esborrar o substituir fitxers.
-- La lectura pública de les imatges es fa per l'URL pública del bucket, no per aquesta política.
drop policy if exists portades_select on storage.objects;
create policy portades_select on storage.objects for select to authenticated using (
  bucket_id = 'portades' and public.rol_actual() in ('admin','editor','col_laborador')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.rol_actual() = 'admin'));
drop policy if exists portades_insert on storage.objects;
create policy portades_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'portades'
  and public.rol_actual() in ('admin','editor','col_laborador')
  and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists portades_update on storage.objects;
create policy portades_update on storage.objects for update to authenticated using (
  bucket_id = 'portades' and public.rol_actual() in ('admin','editor','col_laborador')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.rol_actual() = 'admin'));
drop policy if exists portades_delete on storage.objects;
create policy portades_delete on storage.objects for delete to authenticated using (
  bucket_id = 'portades' and public.rol_actual() in ('admin','editor','col_laborador')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.rol_actual() = 'admin'));

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

-- ---------- WEB PER SECCIONS I APP DE L'EQUIP (també a supabase/web-i-app.sql) ----------
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

-- ---------- 16. PERMISOS DE L'APP DE L'EQUIP (/app) ----------
-- Administrador i editor: tot el contingut (també esborrar notícies).
-- Col·laborador de notícies: només les seves notícies en esborrany i enviar-les a revisió (secció 2).
-- Usuari de consulta: ho pot veure tot (també el que encara no és públic), però no pot canviar res.
drop policy if exists pub_select on public.publicacions;
create policy pub_select on public.publicacions for select to authenticated using (
  public.rol_actual() in ('admin','editor','consulta')
  or (public.rol_actual() = 'col_laborador' and autor_id = auth.uid()));
drop policy if exists pub_delete on public.publicacions;
create policy pub_delete on public.publicacions for delete to authenticated
  using (public.rol_actual() in ('admin','editor'));
drop policy if exists acte_select on public.actes;
create policy acte_select on public.actes for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor','consulta'));
drop policy if exists ent_select on public.entitats;
create policy ent_select on public.entitats for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor','consulta'));
drop policy if exists eina_select on public.eines;
create policy eina_select on public.eines for select to authenticated
  using (publicada or public.rol_actual() in ('admin','editor','consulta'));
