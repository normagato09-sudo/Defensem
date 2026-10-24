-- =====================================================================
-- DEFENSEM · Contingut inicial d'Entitats i Eines (publicat)
-- Executa-ho a Supabase > SQL Editor > New query > Run, DESPRÉS de l'SQL d'Entitats i del d'Eines.
-- 1) Amplia les restriccions (tipus «observatori» i «xarxa», logo com a adreça https:// provisional) i corregeix
--    el check del web, que en la versió anterior donava error amb qualsevol adreça.
-- 2) Afegeix 2 entitats i 1 eina, publicades. Si ja hi són (mateix nom), no es dupliquen.
-- Després es poden editar o esborrar des de l'àrea privada. Es pot tornar a executar sense problemes.
-- =====================================================================

alter table public.entitats drop constraint if exists entitats_web_check;
alter table public.entitats add constraint entitats_web_check
  check (web is null or (char_length(web) <= 300 and web ~ '^https://[^[:space:]]+$'));
alter table public.sollicituds_entitats drop constraint if exists sollicituds_entitats_web_check;
alter table public.sollicituds_entitats add constraint sollicituds_entitats_web_check
  check (web is null or (char_length(web) <= 300 and web ~ '^https?://[^[:space:]]+$'));
alter table public.entitats drop constraint if exists entitats_tipus_check;
alter table public.entitats add constraint entitats_tipus_check
  check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','observatori','xarxa','altres'));
alter table public.sollicituds_entitats drop constraint if exists sollicituds_entitats_tipus_check;
alter table public.sollicituds_entitats add constraint sollicituds_entitats_tipus_check
  check (tipus in ('associacio','collectiu','entitat_veinal','fundacio','cooperativa','sindicat','observatori','xarxa','altres'));
alter table public.entitats drop constraint if exists entitats_logo_check;
alter table public.entitats add constraint entitats_logo_check
  check (logo is null or logo ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
         or (char_length(logo) <= 500 and logo ~ '^https://[^[:space:]]+$'));

-- Entitats
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
