// Prova de permisos de supabase/schema.sql amb un Postgres real en memòria (PGlite).
// Ús:  npm i --no-save @electric-sql/pglite   i després   node supabase/prova-permisos.mjs
// Crea uns "stubs" mínims del que Supabase ja porta (rols anon/authenticated, auth.users, auth.uid(),
// storage.buckets/objects, storage.foldername) i comprova què pot fer cada rol.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ESQUEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const db = new PGlite();
let ok = 0, ko = 0;
function comprova(nom, cond) {
  if (cond) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FALLA ' + nom); }
}

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text not null, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
`);

// Idempotència: s'executa dues vegades.
await db.exec(ESQUEMA);
await db.exec(ESQUEMA);
await db.exec(`grant all on all tables in schema public to service_role;`);
console.log('Esquema executat dues vegades sense errors.');

// --- utilitats ---
// Executa SQL com a un usuari: null = anònim, 'servei' = service_role, 'super' = superusuari (SQL Editor).
async function com(usuari, sql, params = []) {
  return db.transaction(async (tx) => {
    if (usuari === null) await tx.exec('set local role anon');
    else if (usuari === 'servei') await tx.exec('set local role service_role');
    else if (usuari !== 'super') {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [usuari]);
    }
    return tx.query(sql, params);
  });
}
// true si l'operació falla amb error o no afecta cap fila (RLS la filtra en silenci).
async function bloquejat(usuari, sql, params) {
  try { const r = await com(usuari, sql, params); return (r.affectedRows || 0) === 0 && r.rows.length === 0; }
  catch (e) { return true; }
}
async function falla(usuari, sql, params) {
  try { await com(usuari, sql, params); return false; } catch (e) { return true; }
}
async function files(usuari, sql, params) { return (await com(usuari, sql, params)).rows; }
async function afecta(usuari, sql, params) {
  try { return (await com(usuari, sql, params)).affectedRows || 0; } catch (e) { console.log('     (error: ' + e.message + ')'); return -1; }
}
const su = (sql, p) => files('super', sql, p);
async function nouUsuari(email, nom) {
  const id = randomUUID();
  await su('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify({ nom })]);
  return id;
}
async function novaPub(usuari, camps) {
  const c = Object.assign({ tipus: 'noticia', titol: 'Títol', estat: 'esborrany', autor_id: usuari }, camps);
  const r = await com(usuari,
    'insert into publicacions (tipus, titol, resum, contingut, estat, autor_id, imatge) values ($1,$2,$3,$4,$5,$6,$7) returning id',
    [c.tipus, c.titol, c.resum || '', c.contingut || '', c.estat, c.autor_id, c.imatge || null]);
  return r.rows[0].id;
}
const pub = async (id) => (await su('select * from publicacions where id = $1', [id]))[0];
const perfil = async (id) => (await su('select * from profiles where id = $1', [id]))[0];

// --- usuaris ---
const A = await nouUsuari('admin@ex.cat', 'Admin');
const A2 = await nouUsuari('admin2@ex.cat', 'Admin Dos');
const E = await nouUsuari('editor@ex.cat', 'Editora');
const C = await nouUsuari('col@ex.cat', 'Col·laborador');
const C2 = await nouUsuari('col2@ex.cat', 'Col·laboradora Dos');
const Q = await nouUsuari('consulta@ex.cat', 'Consulta');
const D = await nouUsuari('desactivat@ex.cat', 'Desactivat');

console.log('\nUsuaris nous');
comprova('tots els usuaris nous neixen amb rol consulta i actius',
  (await su('select count(*)::int n from profiles where rol = $1 and actiu', ['consulta']))[0].n === 7);
comprova('el nom de les metadades passa al perfil', (await perfil(E)).nom === 'Editora');
// Primer admin: es fa des del SQL Editor (superusuari), com explica el README.
await su("update profiles set rol = 'admin' where id = $1", [A]);
comprova('el primer admin es crea des del SQL Editor', (await perfil(A)).rol === 'admin');

console.log('\nAdministrador: gestió d\'usuaris');
comprova('admin assigna rol editor', await afecta(A, "update profiles set rol = 'editor' where id = $1", [E]) === 1);
comprova('admin assigna rol col·laborador', await afecta(A, "update profiles set rol = 'col_laborador' where id = any($1)", [[C, C2, D]]) === 3);
comprova('admin assigna rol admin a un segon admin', await afecta(A, "update profiles set rol = 'admin' where id = $1", [A2]) === 1);
comprova('admin veu tots els perfils', (await files(A, 'select id from profiles')).length === 7);
comprova('admin desactiva un compte', await afecta(A, 'update profiles set actiu = false where id = $1', [C2]) === 1);
comprova('admin reactiva un compte', await afecta(A, 'update profiles set actiu = true where id = $1', [C2]) === 1);
comprova('admin NO es pot degradar a si mateix', await falla(A, "update profiles set rol = 'editor' where id = $1", [A]));
comprova('admin NO es pot desactivar a si mateix', await falla(A, 'update profiles set actiu = false where id = $1', [A]));
comprova('admin NO pot canviar el correu d\'un perfil', await falla(A, "update profiles set email = 'canvi@ex.cat' where id = $1", [C2]) && (await perfil(C2)).email === 'col2@ex.cat');
comprova('admin canvia el nom d\'un perfil', await afecta(A, "update profiles set nom = 'Col·laboradora Dos' where id = $1", [C2]) === 1);
comprova('admin pot degradar un altre admin si en queda un d\'actiu', await afecta(A, "update profiles set rol = 'editor' where id = $1", [A2]) === 1);
comprova('ni el SQL Editor pot degradar l\'últim admin actiu', await falla('super', "update profiles set rol = 'editor' where id = $1", [A]));
comprova('ni el SQL Editor pot desactivar l\'últim admin actiu', await falla('super', 'update profiles set actiu = false where id = $1', [A]));
comprova('ni el service_role pot degradar l\'últim admin', await falla('servei', "update profiles set rol = 'consulta' where id = $1", [A]));
comprova('no es pot esborrar el perfil de l\'últim admin', await falla('super', 'delete from profiles where id = $1', [A]));
comprova('no es pot esborrar l\'usuari Auth de l\'últim admin (cascade)', await falla('super', 'delete from auth.users where id = $1', [A]));
comprova('l\'últim admin continua actiu', (await perfil(A)).rol === 'admin' && (await perfil(A)).actiu);

console.log('\nAnònim');
comprova('anònim NO llegeix publicacions', await falla(null, 'select * from publicacions'));
comprova('anònim NO llegeix perfils', await falla(null, 'select * from profiles'));
comprova('anònim NO llegeix noms_usuaris', await falla(null, 'select * from noms_usuaris'));
comprova('anònim NO llegeix documents', await falla(null, 'select * from documents'));
comprova('anònim NO insereix publicacions', await falla(null, "insert into publicacions (tipus, titol, autor_id) values ('noticia','x',$1)", [A]));
comprova('anònim sí llegeix publicacions_publiques', !(await falla(null, 'select * from publicacions_publiques')));

console.log('\nCol·laborador');
const P1 = await novaPub(C, { titol: 'Esborrany del col·laborador' });
comprova('crea un esborrany propi', !!P1 && (await pub(P1)).estat === 'esborrany');
comprova('NO crea una publicació ja publicada', await falla(C, "insert into publicacions (tipus, titol, estat, autor_id) values ('noticia','x','publicat',$1)", [C]));
comprova('NO crea a nom d\'un altre', await falla(C, "insert into publicacions (tipus, titol, autor_id) values ('noticia','x',$1)", [C2]));
comprova('NO crea amb estat retornat/arxivat', await falla(C, "insert into publicacions (tipus, titol, estat, autor_id) values ('noticia','x','arxivat',$1)", [C]));
comprova('imatge amb ruta no vàlida rebutjada', await falla(C, "update publicacions set imatge = '../x.jpg' where id = $1", [P1]));
comprova('imatge amb ruta uuid/fitxer acceptada', await afecta(C, 'update publicacions set imatge = $2 where id = $1', [P1, C + '/portada.jpg']) === 1);
comprova('NO es posa estat retornat', await falla(C, "update publicacions set estat = 'retornat' where id = $1", [P1]));
comprova('NO es posa estat arxivat', await falla(C, "update publicacions set estat = 'arxivat' where id = $1", [P1]));
comprova('NO publica el seu esborrany', await bloquejat(C, "update publicacions set estat = 'publicat' where id = $1", [P1]) && (await pub(P1)).estat === 'esborrany');
await afecta(C, "update publicacions set nota_revisio = 'm''autoaprovo' where id = $1", [P1]);
comprova('NO pot tocar nota_revisio', (await pub(P1)).nota_revisio === null);
comprova('NO pot canviar l\'autor', (await afecta(C, 'update publicacions set autor_id = $2 where id = $1', [P1, C2]), (await pub(P1)).autor_id === C));
comprova('envia a revisió', await afecta(C, "update publicacions set estat = 'pendent' where id = $1", [P1]) === 1 && (await pub(P1)).estat === 'pendent');
comprova('NO edita mentre està pendent', await bloquejat(C, "update publicacions set titol = 'canvi' where id = $1", [P1]) && (await pub(P1)).titol === 'Esborrany del col·laborador');
comprova('NO es torna a posar esborrany mentre està pendent', await bloquejat(C, "update publicacions set estat = 'esborrany' where id = $1", [P1]));
comprova('NO s\'assigna rol', await bloquejat(C, "update profiles set rol = 'admin' where id = $1", [C]) && (await perfil(C)).rol === 'col_laborador');
comprova('NO canvia el rol d\'altres', await bloquejat(C, "update profiles set rol = 'consulta' where id = $1", [E]) && (await perfil(E)).rol === 'editor');
comprova('NO veu els perfils d\'altres', (await files(C, 'select id from profiles')).length === 1);
comprova('NO veu noms_usuaris', (await files(C, 'select * from noms_usuaris')).length === 0);
const PC2 = await novaPub(C2, { titol: 'De la col·laboradora dos' });
comprova('NO veu publicacions d\'altres', (await files(C, 'select id from publicacions where id = $1', [PC2])).length === 0);
comprova('NO edita publicacions d\'altres', await bloquejat(C, "update publicacions set titol = 'hack' where id = $1", [PC2]) && (await pub(PC2)).titol === 'De la col·laboradora dos');
comprova('NO esborra ni les seves', await bloquejat(C, 'delete from publicacions where id = $1', [P1]) && !!(await pub(P1)));
comprova('NO gestiona documents', await falla(C, "insert into documents (titol, enllac) values ('x','https://ex.cat')"));
comprova('pot crear directament pendent', !!(await novaPub(C, { titol: 'Directa a revisió', estat: 'pendent' })));

console.log('\nEditor');
comprova('veu totes les publicacions', (await files(E, 'select id from publicacions')).length === (await su('select id from publicacions')).length);
comprova('veu noms dels autors', (await files(E, 'select nom from noms_usuaris where id = $1', [C]))[0]?.nom === 'Col·laborador');
comprova('noms_usuaris no té el correu', !('email' in ((await files(E, 'select * from noms_usuaris limit 1'))[0] || { email: 1 })));
comprova('NO veu el correu d\'altres perfils', (await files(E, 'select email from profiles where id <> $1', [E])).length === 0);
comprova('retorna amb nota', await afecta(E, "update publicacions set estat = 'retornat', nota_revisio = 'Cal citar la font.' where id = $1", [P1]) === 1
  && (await pub(P1)).estat === 'retornat' && (await pub(P1)).nota_revisio === 'Cal citar la font.');
const PE = await novaPub(E, { titol: 'Comunicat de l\'editora', tipus: 'comunicat' });
comprova('esborrany sense published_at', (await pub(PE)).published_at === null);
comprova('publica i s\'omple published_at', await afecta(E, "update publicacions set estat = 'publicat' where id = $1", [PE]) === 1 && (await pub(PE)).published_at !== null);
comprova('NO esborra publicacions', await bloquejat(E, 'delete from publicacions where id = $1', [PE]) && !!(await pub(PE)));
comprova('NO canvia rols', await bloquejat(E, "update profiles set rol = 'admin' where id = $1", [C]) && (await perfil(C)).rol === 'col_laborador');
comprova('NO s\'auto-promociona', (await bloquejat(E, "update profiles set rol = 'admin' where id = $1", [E])) && (await perfil(E)).rol === 'editor');
comprova('NO crea documents', await falla(E, "insert into documents (titol, enllac) values ('x','https://ex.cat')"));
comprova('editor pot crear publicada directament', !!(await novaPub(E, { titol: 'Directa', estat: 'publicat' })));

console.log('\nCol·laborador corregeix una retornada');
comprova('veu la nota de revisió', (await files(C, 'select nota_revisio from publicacions where id = $1', [P1]))[0]?.nota_revisio === 'Cal citar la font.');
comprova('edita la retornada i la reenvia', await afecta(C, "update publicacions set titol = 'Corregit', estat = 'pendent' where id = $1", [P1]) === 1
  && (await pub(P1)).estat === 'pendent' && (await pub(P1)).titol === 'Corregit');

console.log('\nPublicació i vista pública');
await afecta(E, "update publicacions set estat = 'publicat' where id = $1", [P1]);
const publiques = await files(null, 'select * from publicacions_publiques');
comprova('l\'anònim veu només les publicades', publiques.length === (await su("select id from publicacions where estat = 'publicat'")).length && publiques.length >= 3);
comprova('la vista pública no mostra esborranys', !publiques.some((p) => p.id === PC2));
comprova('la vista pública no exposa autor ni nota', !('autor_id' in publiques[0]) && !('nota_revisio' in publiques[0]));
comprova('el col·laborador NO edita la publicada', await bloquejat(C, "update publicacions set titol = 'x' where id = $1", [P1]));
comprova('l\'editor arxiva', await afecta(E, "update publicacions set estat = 'arxivat' where id = $1", [PE]) === 1);
comprova('l\'arxivada ja no és pública', !(await files(null, 'select id from publicacions_publiques')).some((p) => p.id === PE));
comprova('l\'admin esborra publicacions', await afecta(A, 'delete from publicacions where id = $1', [PE]) === 1);

console.log('\nAdmin i editor editen publicacions d\'altres (en qualsevol estat)');
for (const editor of [['admin', A], ['editor', E]]) {
  for (const est of ['esborrany', 'pendent', 'publicat', 'retornat', 'arxivat']) {
    const id = await novaPub(C, { titol: 'De Carles (' + est + ')', contingut: '<p>original</p>' });
    await su('update publicacions set estat = $2 where id = $1', [id, est]);
    const abans = await pub(id);
    const n = await afecta(editor[1], "update publicacions set titol = $2, contingut = '<p>editat</p>', estat = $3 where id = $1", [id, 'Editat per ' + editor[0], est]);
    const despres = await pub(id);
    comprova(`${editor[0]} edita una ${est} d'un col·laborador: es desa, autor i estat intactes`,
      n === 1 && despres.titol === 'Editat per ' + editor[0] && despres.autor_id === C && despres.estat === est);
    if (est === 'publicat') {
      comprova(`${editor[0]}: la publicada editada continua pública amb el text nou i la mateixa data de publicació`,
        (await files(null, 'select titol from publicacions_publiques where id = $1', [id]))[0]?.titol === 'Editat per ' + editor[0]
        && +despres.published_at === +abans.published_at);
    }
    await afecta(editor[1], 'update publicacions set autor_id = $2 where id = $1', [id, editor[1]]);
    comprova(`${editor[0]} NO pot canviar l'autor d'una ${est}`, (await pub(id)).autor_id === C);
    comprova(`col·laboradora dos NO edita la ${est} d'un altre`, await bloquejat(C2, "update publicacions set titol = 'hack' where id = $1", [id]) && (await pub(id)).titol === 'Editat per ' + editor[0]);
    comprova(`consulta NO edita la ${est} d'un altre`, await bloquejat(Q, "update publicacions set titol = 'hack' where id = $1", [id]) && (await pub(id)).titol === 'Editat per ' + editor[0]);
  }
}
{
  const id = await novaPub(C, { titol: 'Per canviar d\'estat' });
  comprova('l\'editor canvia l\'estat d\'una publicació d\'altri amb els botons (publica)', await afecta(E, "update publicacions set estat = 'publicat' where id = $1", [id]) === 1
    && (await pub(id)).estat === 'publicat' && (await pub(id)).autor_id === C);
  await su("update publicacions set estat = 'esborrany' where id = $1", [id]);
  comprova('el col·laborador continua sense poder arxivar la seva', await falla(C, "update publicacions set estat = 'arxivat' where id = $1", [id]) && (await pub(id)).estat === 'esborrany');
}

console.log('\nDocuments i rol de consulta');
const doc1 = (await files(A, "insert into documents (titol, enllac, created_by) values ('Acta', 'https://ex.cat/acta.pdf', $1) returning id", [A]))[0].id;
const doc2 = (await files(A, "insert into documents (titol, enllac, created_by) values ('Pressupost', 'https://ex.cat/p.pdf', $1) returning id", [A]))[0].id;
comprova('l\'admin crea documents', !!doc1 && !!doc2);
comprova('enllaços no https rebutjats', await falla(A, "insert into documents (titol, enllac) values ('x','javascript:alert(1)')"));
comprova('l\'admin dona permís', await afecta(A, 'insert into permisos_document (document_id, usuari_id) values ($1, $2), ($1, $3)', [doc1, Q, D]) === 2);
comprova('consulta veu només el document amb permís', JSON.stringify((await files(Q, 'select id from documents')).map((d) => d.id)) === JSON.stringify([doc1]));
comprova('editor NO dona permisos de documents', await falla(E, 'insert into permisos_document (document_id, usuari_id) values ($1, $2)', [doc2, E]));
comprova('editor NO veu documents sense permís', (await files(E, 'select id from documents')).length === 0);
comprova('consulta NO es dona permisos', await falla(Q, 'insert into permisos_document (document_id, usuari_id) values ($1, $2)', [doc2, Q]));
comprova('consulta NO crea documents', await falla(Q, "insert into documents (titol, enllac) values ('x','https://ex.cat')"));
comprova('consulta NO esborra documents', await bloquejat(Q, 'delete from documents where id = $1', [doc1]));
comprova('consulta NO crea publicacions', await falla(Q, "insert into publicacions (tipus, titol, autor_id) values ('noticia','x',$1)", [Q]));
comprova('consulta NO veu esborranys ni pendents', (await files(Q, 'select id from publicacions')).length === 0);
comprova('consulta veu només el seu perfil', (await files(Q, 'select id from profiles')).length === 1);
comprova('l\'admin treu permisos', await afecta(A, 'delete from permisos_document where document_id = $1 and usuari_id = $2', [doc1, Q]) === 1
  && (await files(Q, 'select id from documents')).length === 0);
await afecta(A, 'insert into permisos_document (document_id, usuari_id) values ($1, $2)', [doc1, Q]);

console.log('\nCompte desactivat');
const PD = await novaPub(D, { titol: 'Escrit abans de desactivar' });
comprova('l\'admin desactiva el compte', await afecta(A, 'update profiles set actiu = false where id = $1', [D]) === 1);
comprova('desactivat NO veu publicacions', (await files(D, 'select id from publicacions')).length === 0);
comprova('desactivat NO crea publicacions', await falla(D, "insert into publicacions (tipus, titol, autor_id) values ('noticia','x',$1)", [D]));
comprova('desactivat NO edita la seva', await bloquejat(D, "update publicacions set titol = 'x' where id = $1", [PD]));
comprova('desactivat NO veu documents encara que tingui permís', (await files(D, 'select id from documents')).length === 0);
comprova('les seves publicacions es conserven', !!(await pub(PD)));

console.log('\nStorage (portades)');
const obj = (u, nom) => afecta(u, "insert into storage.objects (bucket_id, name) values ('portades', $1)", [nom]);
comprova('el bucket portades existeix i és públic', (await su("select public from storage.buckets where id = 'portades'"))[0]?.public === true);
comprova('col·laborador puja a la seva carpeta', await obj(C, C + '/a.jpg') === 1);
comprova('col·laborador NO puja a la carpeta d\'un altre', await falla(C, "insert into storage.objects (bucket_id, name) values ('portades', $1)", [E + '/a.jpg']));
comprova('col·laborador NO puja fora de carpeta', await falla(C, "insert into storage.objects (bucket_id, name) values ('portades', 'a.jpg')"));
comprova('editor puja a la seva carpeta', await obj(E, E + '/b.png') === 1);
comprova('consulta NO puja', await falla(Q, "insert into storage.objects (bucket_id, name) values ('portades', $1)", [Q + '/a.jpg']));
comprova('desactivat NO puja', await falla(D, "insert into storage.objects (bucket_id, name) values ('portades', $1)", [D + '/a.jpg']));
comprova('anònim NO puja', await falla(null, "insert into storage.objects (bucket_id, name) values ('portades', 'x/a.jpg')"));
comprova('col·laborador NO veu els fitxers d\'altres', (await files(C, "select name from storage.objects where bucket_id = 'portades'")).every((o) => o.name.startsWith(C + '/')));
comprova('col·laborador NO esborra imatges d\'altres', await bloquejat(C, "delete from storage.objects where name = $1", [E + '/b.png']));
comprova('col·laborador esborra la seva imatge', await afecta(C, "delete from storage.objects where name = $1", [C + '/a.jpg']) === 1);
comprova('consulta NO veu fitxers', (await files(Q, 'select name from storage.objects')).length === 0);
comprova('admin esborra imatges d\'altres', await afecta(A, "delete from storage.objects where name = $1", [E + '/b.png']) === 1);

console.log('\nEntitats');
const novaEnt = (u, camps = {}) => com(u, 'insert into entitats (nom, tipus, municipi, publicada) values ($1,$2,$3,$4) returning id',
  [camps.nom || 'Entitat', camps.tipus || 'associacio', camps.municipi || 'Albons', !!camps.publicada]).then((r) => r.rows[0].id);
const ENT1 = await novaEnt(E, { nom: 'Entitat esborrany' });
comprova('editor crea una entitat (no publicada per defecte)', !!ENT1 && (await su('select publicada from entitats where id = $1', [ENT1]))[0].publicada === false);
comprova('created_by és qui la crea, encara que s\'intenti falsejar',
  (await files(A, 'insert into entitats (nom, tipus, created_by) values ($1, $2, $3) returning created_by', ['Una altra', 'collectiu', E]))[0].created_by === A);
comprova('admin publica una entitat', await afecta(A, 'update entitats set publicada = true where id = $1', [ENT1]) === 1);
const ENT2 = await novaEnt(A, { nom: 'Entitat amagada' });
comprova('anònim veu només les publicades', (await files(null, 'select id from entitats')).map((x) => x.id).join() === ENT1);
comprova('anònim NO veu created_by', await falla(null, 'select created_by from entitats'));
comprova('anònim NO crea entitats', await falla(null, "insert into entitats (nom, tipus) values ('x','associacio')"));
comprova('anònim NO edita entitats', await bloquejat(null, "update entitats set nom = 'x' where id = $1", [ENT1]));
comprova('col·laborador NO crea entitats', await falla(C, "insert into entitats (nom, tipus) values ('x','associacio')"));
comprova('col·laborador NO publica entitats', await bloquejat(C, 'update entitats set publicada = true where id = $1', [ENT2]));
comprova('col·laborador veu només les publicades', (await files(C, 'select id from entitats')).every((x) => x.id === ENT1));
comprova('consulta NO crea entitats', await falla(Q, "insert into entitats (nom, tipus) values ('x','associacio')"));
comprova('desactivat NO crea entitats', await falla(D, "insert into entitats (nom, tipus) values ('x','associacio')"));
comprova('editor veu també les no publicades', (await files(E, 'select id from entitats where id = $1', [ENT2])).length === 1);
comprova('editor edita i despublica', await afecta(E, 'update entitats set descripcio = $2, publicada = false where id = $1', [ENT1, 'Text']) === 1);
comprova('tipus no vàlid rebutjat', await falla(E, "insert into entitats (nom, tipus) values ('x','empresa')"));
comprova('web https acceptada', await afecta(E, "update entitats set web = 'https://www.exemple.cat/ruta' where id = $1", [ENT1]) === 1);
comprova('logo com a adreça https acceptat', await afecta(E, "update entitats set logo = 'https://ex.cat/logo.png' where id = $1", [ENT1]) === 1);
comprova('logo amb adreça http rebutjat', await falla(E, "update entitats set logo = 'http://ex.cat/logo.png' where id = $1", [ENT1]));
comprova('tipus observatori i xarxa acceptats', await afecta(E, "update entitats set tipus = 'observatori' where id = $1", [ENT1]) === 1
  && await afecta(E, "update entitats set tipus = 'xarxa' where id = $1", [ENT1]) === 1);
comprova('web sense https rebutjada', await falla(E, "update entitats set web = 'javascript:alert(1)' where id = $1", [ENT1]));
comprova('instagram que no és instagram.com rebutjat', await falla(E, "update entitats set instagram = 'https://ex.cat/x' where id = $1", [ENT1]));
comprova('instagram vàlid acceptat', await afecta(E, "update entitats set instagram = 'https://www.instagram.com/nom.entitat/' where id = $1", [ENT1]) === 1);
comprova('logo amb ruta no vàlida rebutjat', await falla(E, "update entitats set logo = '../x.png' where id = $1", [ENT1]));
comprova('col·laborador NO esborra entitats', await bloquejat(C, 'delete from entitats where id = $1', [ENT2]));
comprova('editor esborra entitats', await afecta(E, 'delete from entitats where id = $1', [ENT2]) === 1);
const ENT3 = await novaEnt(E, { nom: 'Per esborrar' });
comprova('admin esborra entitats', await afecta(A, 'delete from entitats where id = $1', [ENT3]) === 1);

console.log('\nSol·licituds d\'adhesió');
const sol = (u, camps = {}) => afecta(u, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment)
  values ($1,$2,$3,$4,$5,$6)`, [camps.nom || 'Associació X', camps.tipus || 'associacio', camps.municipi || 'Albons',
  camps.persona || 'Persona', camps.email || 'contacte@ex.cat', camps.consentiment === undefined ? true : camps.consentiment]);
comprova('anònim envia una sol·licitud', await sol(null) === 1);
comprova('anònim envia una sol·licitud amb web i Instagram', await afecta(null, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment, web, instagram)
  values ('Amb web','xarxa','Albons','P','web@ex.cat', true, 'https://www.exemple.cat', '@nom')`) === 1);
comprova('anònim NO llegeix sol·licituds', await falla(null, 'select * from sollicituds_entitats'));
comprova('sense consentiment es rebutja', await falla(null, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment)
  values ('x','associacio','Albons','P','a@ex.cat', false)`));
comprova('correu no vàlid rebutjat', await falla(null, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment)
  values ('x','associacio','Albons','P','no-es-correu', true)`));
comprova('anònim NO pot fixar l\'estat', await falla(null, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment, estat)
  values ('x','associacio','Albons','P','b@ex.cat', true, 'acceptada')`));
comprova('el correu es desa en minúscules', (await su("select email from sollicituds_entitats where nom_entitat = 'Associació X' limit 1"))[0].email === 'contacte@ex.cat');
await sol(null, { email: 'Repetit@ex.cat' }); await sol(null, { email: 'repetit@ex.cat' }); await sol(null, { email: 'repetit@ex.cat' });
comprova('màxim 3 sol·licituds per correu i dia', await falla(null, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment)
  values ('x','associacio','Albons','P','REPETIT@ex.cat', true)`));
comprova('col·laborador NO llegeix sol·licituds', (await files(C, 'select id from sollicituds_entitats')).length === 0);
comprova('consulta NO llegeix sol·licituds', (await files(Q, 'select id from sollicituds_entitats')).length === 0);
const S1 = (await files(E, 'select id from sollicituds_entitats order by created_at limit 1'))[0]?.id;
comprova('editor llegeix sol·licituds', !!S1);
comprova('editor canvia l\'estat', await afecta(E, "update sollicituds_entitats set estat = 'revisada' where id = $1", [S1]) === 1);
comprova('editor NO modifica les dades enviades', await falla(E, "update sollicituds_entitats set email = 'x@ex.cat' where id = $1", [S1]));
comprova('col·laborador NO canvia l\'estat', await bloquejat(C, "update sollicituds_entitats set estat = 'acceptada' where id = $1", [S1]));
comprova('editor NO esborra sol·licituds', await bloquejat(E, 'delete from sollicituds_entitats where id = $1', [S1]));
comprova('admin esborra sol·licituds', await afecta(A, 'delete from sollicituds_entitats where id = $1', [S1]) === 1);
for (let i = 0; (await su("select count(*)::int n from sollicituds_entitats where created_at > now() - interval '1 hour'"))[0].n < 20; i++)
  await su(`insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment)
  values ('x','associacio','Albons','P',$1, true)`, ['massiu' + i + '@ex.cat']);
comprova('límit global de 20 sol·licituds per hora', await falla(null, `insert into sollicituds_entitats (nom_entitat, tipus, municipi, persona_contacte, email, consentiment)
  values ('x','associacio','Albons','P','nou@ex.cat', true)`));

console.log('\nEines');
const novaEina = (u, camps = {}) => com(u, 'insert into eines (nom, url, categoria, ordre, publicada) values ($1,$2,$3,$4,$5) returning id',
  [camps.nom || 'Visor', camps.url || 'https://visor.exemple.cat/', camps.categoria || 'urbanisme', camps.ordre || 0, !!camps.publicada]).then((r) => r.rows[0].id);
const EI1 = await novaEina(E, { nom: 'Visor A', publicada: true, ordre: 2 });
const EI2 = await novaEina(A, { nom: 'Visor B', ordre: 1 });
comprova('editor i admin creen eines (no publicades per defecte)', !!EI1 && (await su('select publicada from eines where id = $1', [EI2]))[0].publicada === false);
comprova('anònim veu només les publicades', (await files(null, 'select id from eines')).map((x) => x.id).join() === EI1);
comprova('anònim NO veu created_by', await falla(null, 'select created_by from eines'));
comprova('anònim NO crea eines', await falla(null, "insert into eines (nom, url, categoria) values ('x','https://x.cat','altres')"));
comprova('col·laborador NO crea eines', await falla(C, "insert into eines (nom, url, categoria) values ('x','https://x.cat','altres')"));
comprova('consulta NO crea eines', await falla(Q, "insert into eines (nom, url, categoria) values ('x','https://x.cat','altres')"));
comprova('col·laborador NO publica eines', await bloquejat(C, 'update eines set publicada = true where id = $1', [EI2]));
comprova('col·laborador veu només les publicades', (await files(C, 'select id from eines')).every((x) => x.id === EI1));
comprova('URL sense https rebutjada', await falla(E, "update eines set url = 'http://x.cat' where id = $1", [EI2]));
comprova('URL javascript: rebutjada', await falla(E, "update eines set url = 'javascript:alert(1)' where id = $1", [EI2]));
comprova('categoria no vàlida rebutjada', await falla(E, "update eines set categoria = 'politica' where id = $1", [EI2]));
comprova('categoria «altres» acceptada', await afecta(E, "update eines set categoria = 'altres' where id = $1", [EI2]) === 1);
comprova('editor reordena i publica', await afecta(E, 'update eines set ordre = 5, publicada = true where id = $1', [EI2]) === 1);
comprova('anònim les veu en l\'ordre desat', (await files(null, 'select nom from eines order by ordre')).map((x) => x.nom).join() === 'Visor A,Visor B');
comprova('col·laborador NO esborra eines', await bloquejat(C, 'delete from eines where id = $1', [EI1]));
comprova('editor esborra eines', await afecta(E, 'delete from eines where id = $1', [EI1]) === 1);
comprova('admin esborra eines', await afecta(A, 'delete from eines where id = $1', [EI2]) === 1);

console.log('\nMissatges de contacte');
const msg = (u, email = 'm@ex.cat', extra = {}) => afecta(u, 'insert into missatges_contacte (nom, email, missatge, consentiment) values ($1,$2,$3,$4)',
  [extra.nom || 'Nom', email, extra.missatge || 'Hola', extra.consentiment === undefined ? true : extra.consentiment]);
comprova('anònim envia un missatge', await msg(null) === 1);
comprova('anònim NO llegeix missatges', await falla(null, 'select * from missatges_contacte'));
comprova('sense consentiment es rebutja', await falla(null, 'insert into missatges_contacte (nom, email, missatge, consentiment) values ($1,$2,$3,false)', ['N', 'n@ex.cat', 'x']));
comprova('correu no vàlid rebutjat', await falla(null, 'insert into missatges_contacte (nom, email, missatge, consentiment) values ($1,$2,$3,true)', ['N', 'no correu', 'x']));
comprova('missatge buit rebutjat', await falla(null, "insert into missatges_contacte (nom, email, missatge, consentiment) values ('N','b@ex.cat','',true)"));
comprova('anònim NO pot fixar l\'estat', await falla(null, "insert into missatges_contacte (nom, email, missatge, consentiment, estat) values ('N','c@ex.cat','x',true,'respost')"));
await msg(null, 'Rep@ex.cat'); await msg(null, 'rep@ex.cat'); await msg(null, 'rep@ex.cat');
comprova('màxim 3 missatges per correu i dia', await falla(null, "insert into missatges_contacte (nom, email, missatge, consentiment) values ('N','REP@ex.cat','x',true)"));
comprova('col·laborador NO llegeix missatges', (await files(C, 'select id from missatges_contacte')).length === 0);
comprova('consulta NO llegeix missatges', (await files(Q, 'select id from missatges_contacte')).length === 0);
const M1 = (await files(E, 'select id from missatges_contacte order by created_at limit 1'))[0]?.id;
comprova('editor llegeix missatges', !!M1);
comprova('editor marca com a respost', await afecta(E, "update missatges_contacte set estat = 'respost' where id = $1", [M1]) === 1);
comprova('editor NO modifica el missatge', await falla(E, "update missatges_contacte set missatge = 'x' where id = $1", [M1]));
comprova('col·laborador NO canvia l\'estat', await bloquejat(C, "update missatges_contacte set estat = 'llegit' where id = $1", [M1]));
comprova('editor NO esborra missatges', await bloquejat(E, 'delete from missatges_contacte where id = $1', [M1]));
comprova('admin esborra missatges', await afecta(A, 'delete from missatges_contacte where id = $1', [M1]) === 1);

console.log('\nAgenda (actes)');
const nouActe = (u, camps = {}) => com(u, 'insert into actes (titol, data, publicada, cartell) values ($1,$2,$3,$4) returning id',
  [camps.titol || 'Acte', camps.data || '2026-11-01', !!camps.publicada, camps.cartell || null]).then((r) => r.rows[0].id);
const AC1 = await nouActe(E, { titol: 'Publicat', publicada: true, cartell: '/img/agenda/caminada-projecte-julia.webp' });
const AC2 = await nouActe(A, { titol: 'Ocult', cartell: E + '/cartell.jpg' });
comprova('editor i admin creen actes (no publicats per defecte)', !!AC1 && (await su('select publicada from actes where id = $1', [AC2]))[0].publicada === false);
comprova('anònim veu només els publicats', (await files(null, 'select id from actes')).map((x) => x.id).join() === AC1);
comprova('anònim NO veu created_by', await falla(null, 'select created_by from actes'));
comprova('anònim NO crea actes', await falla(null, "insert into actes (titol, data) values ('x', '2026-11-01')"));
comprova('col·laborador NO crea actes', await falla(C, "insert into actes (titol, data) values ('x', '2026-11-01')"));
comprova('col·laborador NO publica actes', await bloquejat(C, 'update actes set publicada = true where id = $1', [AC2]));
comprova('consulta NO crea actes', await falla(Q, "insert into actes (titol, data) values ('x', '2026-11-01')"));
comprova('data de fi anterior a la d\'inici rebutjada', await falla(E, "update actes set data_fi = '2026-01-01' where id = $1", [AC1]));
comprova('cartell amb ruta no vàlida rebutjat', await falla(E, "update actes set cartell = 'https://x.cat/a.jpg' where id = $1", [AC1]));
comprova('editor publica i oculta', await afecta(E, 'update actes set publicada = true where id = $1', [AC2]) === 1 && await afecta(E, 'update actes set publicada = false where id = $1', [AC2]) === 1);
comprova('col·laborador NO esborra actes', await bloquejat(C, 'delete from actes where id = $1', [AC1]));
comprova('editor esborra actes', await afecta(E, 'delete from actes where id = $1', [AC2]) === 1);
comprova('admin esborra actes', await afecta(A, 'delete from actes where id = $1', [AC1]) === 1);

console.log('\nIdempotència amb dades');
await db.exec(ESQUEMA);
comprova('tornar a executar l\'esquema no perd dades', (await su('select count(*)::int n from profiles'))[0].n === 7 && !!(await pub(P1)));

console.log(`\n${ok} correctes, ${ko} fallades.`);
process.exit(ko ? 1 : 0);
