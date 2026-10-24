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

-- Vista pública: NOMÉS contingut publicat i sense dades internes (ni autor, ni notes de revisió).
create or replace view public.publicacions_publiques as
  select id, tipus, titol, resum, contingut, imatge, published_at
  from public.publicacions where estat = 'publicat';
grant select on public.publicacions_publiques to anon, authenticated;

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
-- El logo és una imatge del bucket «portades» (mateixa carpeta per persona que les portades).
create table if not exists public.entitats (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (char_length(nom) between 1 and 200),
  tipus       text not null check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','altres')),
  municipi    text not null default '' check (char_length(municipi) <= 100),
  descripcio  text not null default '' check (char_length(descripcio) <= 600),
  web         text check (web is null or web ~ '^https://[^ ]{1,300}$'),
  instagram   text check (instagram is null or instagram ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$'),
  logo        text check (logo is null or logo ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
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
-- Formulari públic «La teva entitat vol adherir-s'hi?». Qualsevol pot enviar-ne (sense llegir res);
-- només admin i editor les veuen i en canvien l'estat; només admin les esborra.
-- Antispam a la base de dades: límit per correu i límit global per hora (el navegador hi afegeix
-- un camp parany i un temps mínim d'emplenament).
create table if not exists public.sollicituds_entitats (
  id               uuid primary key default gen_random_uuid(),
  nom_entitat      text not null check (char_length(nom_entitat) between 1 and 200),
  tipus            text not null check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','altres')),
  municipi         text not null check (char_length(municipi) between 1 and 100),
  descripcio       text not null default '' check (char_length(descripcio) <= 600),
  web              text check (web is null or web ~ '^https?://[^ ]{1,300}$'),
  instagram        text check (instagram is null or char_length(instagram) between 1 and 100),
  persona_contacte text not null check (char_length(persona_contacte) between 1 and 120),
  email            text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
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

-- Inserció sense lectura (el navegador envia amb «Prefer: return=minimal»). De les existents, només l'estat es pot canviar.
revoke all on public.sollicituds_entitats from anon, authenticated;
grant insert (nom_entitat, tipus, municipi, descripcio, web, instagram, persona_contacte, email, telefon, missatge, consentiment)
  on public.sollicituds_entitats to anon, authenticated;
grant select, delete on public.sollicituds_entitats to authenticated;
grant update (estat) on public.sollicituds_entitats to authenticated;

drop policy if exists sol_insert on public.sollicituds_entitats;
create policy sol_insert on public.sollicituds_entitats for insert to anon, authenticated
  with check (consentiment);
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
