// Prova de la web amb un navegador real (Playwright + Chromium).
// Ús: npm i --no-save playwright && npx playwright install chromium && node proves/prova-web.mjs
// - Serveix public/ en local.
// - Sense Supabase: comprova la web pública, les pàgines legals, els enllaços i l'avís de "no configurada".
// - Amb un Supabase SIMULAT (interceptant les peticions de xarxa): comprova l'inici de sessió, el menú per rol,
//   els botons segons el rol, el formulari, la recuperació de contrasenya i la neteja d'HTML.
//   Això prova la interfície; la seguretat real (RLS) es prova a supabase/prova-permisos.mjs.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const ARREL = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
// Les capçaleres de vercel.json s'apliquen també aquí, com a Vercel. A la CSP, el Supabase real es canvia pel simulat.
const VERCEL = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const capcaleres = (cami) => Object.fromEntries(VERCEL.headers.filter((h) => new RegExp('^' + h.source + '$').test(cami))
  .flatMap((h) => h.headers.map((x) => [x.key, x.value.replace(/[a-z0-9]+\.supabase\.co/g, 'prova.supabase.co')])));
const servidor = http.createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  let cami = normalize(decodeURIComponent(ruta)).replace(/^([/\\])+/, '');
  if (cami.includes('..')) { res.writeHead(400); return res.end(); }
  const red = (VERCEL.redirects || []).find((r) => r.source === ruta);   // com Vercel: redireccions de vercel.json (camins exactes)
  if (red) { res.writeHead(red.statusCode || (red.permanent === false ? 307 : 308), { Location: red.destination, ...capcaleres(ruta) }); return res.end(); }
  const rew = (VERCEL.rewrites || []).find((r) => r.source === ruta);    // com Vercel: rewrites (p. ex. /joc → /joc.html)
  if (rew) cami = rew.destination.replace(/^\//, '');
  let f = join(ARREL, cami);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); const c = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', ...capcaleres(ruta) }); res.end(c);
  } catch { // com Vercel: qualsevol adreça inexistent rep /404.html amb estat 404
    res.writeHead(404, { 'Content-Type': MIME['.html'], ...capcaleres(ruta) }); res.end(await readFile(join(ARREL, '404.html')));
  }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ORIGEN = 'http://localhost:' + servidor.address().port;

let ok = 0, ko = 0;
function comprova(nom, cond, detall) {
  if (cond) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FALLA ' + nom + (detall ? ' → ' + detall : '')); }
}

// ---------------- Supabase simulat ----------------
const SB = 'https://prova.supabase.co';
const PW = 'contrasenya-bona-123';
const U = { A: randomUUID(), E: randomUUID(), C: randomUUID(), Q: randomUUID(), D: randomUUID() };
function dadesInicials() {
  const ara = new Date().toISOString();
  return {
    profiles: [
      { id: U.A, email: 'admin@ex.cat', nom: 'Anna Admin', rol: 'admin', actiu: true, created_at: ara },
      { id: U.E, email: 'editor@ex.cat', nom: 'Eli Editora', rol: 'editor', actiu: true, created_at: ara },
      { id: U.C, email: 'col@ex.cat', nom: 'Carles Col', rol: 'col_laborador', actiu: true, created_at: ara },
      { id: U.Q, email: 'consulta@ex.cat', nom: 'Queralt Consulta', rol: 'consulta', actiu: true, created_at: ara },
      { id: U.D, email: 'desactivat@ex.cat', nom: 'Dani Desactivat', rol: 'col_laborador', actiu: false, created_at: ara }
    ],
    publicacions: [
      { id: randomUUID(), seccio: 'defensem', tipus: 'noticia', titol: 'Esborrany del Carles', resum: '', contingut: '<p>hola</p>', imatge: null, estat: 'esborrany', nota_revisio: null, autor_id: U.C, created_at: ara, updated_at: ara, published_at: null },
      { id: randomUUID(), seccio: 'defensem', tipus: 'noticia', titol: 'Pendent del Carles', resum: 'r', contingut: '<p>text</p>', imatge: null, estat: 'pendent', nota_revisio: null, autor_id: U.C, created_at: ara, updated_at: ara, published_at: null },
      { id: randomUUID(), seccio: 'defensem', tipus: 'noticia', titol: 'Retornada del Carles', resum: '', contingut: '', imatge: null, estat: 'retornat', nota_revisio: 'Falta la font de les dades.', autor_id: U.C, created_at: ara, updated_at: ara, published_at: null },
      { id: randomUUID(), seccio: 'defensem', tipus: 'comunicat', titol: 'Comunicat publicat', resum: 'Resum del comunicat', imatge: U.E + '/portada.jpg', estat: 'publicat', nota_revisio: null, autor_id: U.E, created_at: ara, updated_at: ara, published_at: ara,
        contingut: '<p>Text <b>important</b>.</p><script>window.__xss=1</script><img src=x onerror="window.__xss=2"><a href="javascript:window.__xss=3">mal</a><p style="color:red" onclick="window.__xss=4">estil</p><a href="https://exemple.cat">bo</a>' }
    ],
    documents: [{ id: randomUUID(), titol: 'Acta de l’assemblea', descripcio: 'Acta', enllac: 'https://exemple.cat/acta.pdf', created_by: U.A, created_at: ara }],
    permisos_document: [],
    entitats: [],
    sollicituds_entitats: [],
    missatges_contacte: [],
    eines: [],
    actes: [],
    projectes: [],
    informacio: [],
    pagines: []
  };
}
let BD = dadesInicials(), peticions = [], fallaLogout = false, pujades = [];
// Amplada i alçada d'un JPEG (marcador SOF0/SOF2), per comprovar que les fotos es redueixen abans de pujar-les.
function midesJpeg(b) {
  if (!b) return null;
  const ini = b.indexOf(Buffer.from([0xff, 0xd8, 0xff]));   // supabase-js puja el fitxer dins d'un multipart
  if (ini < 0) return null;
  for (let i = ini + 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID() }) + '.signatura';
const usuariAuth = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: u.created_at });
const sessio = (u) => ({ access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-' + u.id, user: usuariAuth(u) });
function quiEs(h) {
  const t = (h.authorization || '').replace('Bearer ', '');
  try { const sub = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub; return BD.profiles.find((p) => p.id === sub); } catch { return null; }
}
// RLS simplificada (només per a la interfície; la real es prova amb Postgres).
function visibles(taula, u) {
  const rol = u && u.actiu ? u.rol : null;
  if (taula === 'publicacions_publiques') return BD.publicacions.filter((p) => p.estat === 'publicat')
    .map(({ id, tipus, titol, resum, contingut, imatge, published_at, seccio, mitja, font_url, data, projecte }) => ({ id, tipus, titol, resum, contingut, imatge, published_at,
      seccio: seccio || 'defensem', mitja: mitja || '', font_url: font_url || null, data: data || (published_at || '').slice(0, 10), projecte: projecte || null }));
  if (taula === 'projectes' || taula === 'informacio') return BD[taula].filter((e) => e.publicada || ['admin', 'editor', 'consulta'].includes(rol));
  if (taula === 'pagines') return BD.pagines;
  if (taula === 'missatges_contacte') return ['admin', 'editor'].includes(rol) ? BD.missatges_contacte : (u ? [] : null);
  if (taula === 'actes') return BD.actes.filter((e) => e.publicada || ['admin', 'editor', 'consulta'].includes(rol));
  if (taula === 'eines') return BD.eines.filter((e) => e.publicada || ['admin', 'editor', 'consulta'].includes(rol));
  if (taula === 'entitats') return BD.entitats.filter((e) => e.publicada || ['admin', 'editor', 'consulta'].includes(rol));
  if (taula === 'sollicituds_entitats') return ['admin', 'editor'].includes(rol) ? BD.sollicituds_entitats : (u ? [] : null);
  if (!u) return null;
  if (taula === 'profiles') return BD.profiles.filter((p) => p.id === u.id || rol === 'admin');
  if (taula === 'noms_usuaris') return ['admin', 'editor'].includes(rol) ? BD.profiles.map(({ id, nom }) => ({ id, nom })) : [];
  if (taula === 'publicacions') return BD.publicacions.filter((p) => ['admin', 'editor', 'consulta'].includes(rol) || (rol === 'col_laborador' && p.autor_id === u.id));
  if (taula === 'documents') return BD.documents.filter((d) => rol === 'admin' || (rol && BD.permisos_document.some((x) => x.document_id === d.id && x.usuari_id === u.id)));
  if (taula === 'permisos_document') return BD.permisos_document.filter((x) => rol === 'admin' || x.usuari_id === u.id);
  return null;
}
function filtra(files, params) {
  for (const [k, v] of params) if (v.startsWith('eq.')) files = files.filter((f) => String(f[k]) === v.slice(3));
  const o = params.get('order');
  if (o) { const [c, dir] = o.split(',')[0].split('.'); files = [...files].sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? '')) * (dir === 'desc' ? -1 : 1)); }
  const sel = params.get('select');
  if (sel && sel !== '*') files = files.map((f) => Object.fromEntries(sel.split(',').map((c) => [c, f[c]])));
  return files;
}
async function supabaseFals(route) {
  const req = route.request(), url = new URL(req.url()), h = req.headers(), m = req.method();
  const json = (status, cos, extra) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...(extra || {}) }, body: cos === undefined ? '' : JSON.stringify(cos) });
  if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  peticions.push({ m, url: url.pathname + url.search, cos: req.postData() });
  const p = url.pathname;
  if (p.startsWith('/storage/v1/object/public/')) return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  if (h.apikey !== 'anon-de-prova') return json(401, { message: 'Invalid API key' });
  if (p.startsWith('/storage/v1/object/informacio/') && m === 'POST') { pujades.push({ cami: p.slice('/storage/v1/object/informacio/'.length), bucket: 'informacio', mida: (req.postDataBuffer() || []).length });
    return quiEs(h) ? json(200, { Key: p.slice('/storage/v1/object/'.length), Id: randomUUID() }) : json(403, { message: 'new row violates row-level security policy' }); }
  if (p === '/storage/v1/object/informacio' && m === 'DELETE') { pujades.push({ esborrat: JSON.parse(req.postData() || '{}').prefixes }); return json(200, []); }
  if (p.startsWith('/storage/v1/object/portades/') && m === 'POST') { const cos = req.postDataBuffer(); pujades.push({ cami: p.slice('/storage/v1/object/portades/'.length), mida: cos ? cos.length : 0, tipus: h['content-type'], mides: midesJpeg(cos) }); }
  if (p === '/storage/v1/object/portades' && m === 'DELETE') return json(200, []);
  if (p.startsWith('/storage/v1/object/portades/') && m === 'POST') return quiEs(h) ? json(200, { Key: p.slice('/storage/v1/object/'.length), Id: randomUUID() }) : json(403, { message: 'new row violates row-level security policy' });
  if (p === '/auth/v1/token') {
    const b = JSON.parse(req.postData() || '{}');
    const u = BD.profiles.find((x) => x.email === b.email);
    if (!u || b.password !== PW) return json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(200, sessio(u));
  }
  if (p === '/auth/v1/user') { const u = quiEs(h); if (!u) return json(401, { msg: 'invalid JWT' }); if (m === 'PUT') return json(200, usuariAuth(u)); return json(200, usuariAuth(u)); }
  if (p === '/auth/v1/logout' && fallaLogout) return json(500, { msg: 'Error intern simulat' });
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  if (p === '/auth/v1/recover') return json(200, {});
  if (p.startsWith('/rest/v1/')) {
    const taula = p.slice('/rest/v1/'.length), u = quiEs(h);
    if (taula === 'missatges_contacte' && m === 'POST') {
      BD.missatges_contacte.push({ id: randomUUID(), estat: 'nou', created_at: new Date().toISOString(), ...JSON.parse(req.postData()) });
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
    }
    // Sol·licituds d'adhesió: tancades (la taula es conserva, però ningú no hi insereix des de la web).
    if (taula === 'sollicituds_entitats' && m === 'POST') return json(403, { code: '42501', message: 'permission denied for table sollicituds_entitats' });
    const vis = visibles(taula, u);
    if (vis === null) return json(401, { code: '42501', message: 'permission denied for table ' + taula });
    if (m === 'GET' || m === 'HEAD') {
      const tots = filtra(vis, url.searchParams);
      const des = +(url.searchParams.get('offset') || 0), lim = url.searchParams.has('limit') ? +url.searchParams.get('limit') : Infinity;
      const f = tots.slice(des, des + lim);
      const rang = (f.length ? des + '-' + (des + f.length - 1) : '*') + '/' + tots.length;
      if (m === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': rang } });
      return json(200, f, { 'access-control-expose-headers': 'content-range', 'content-range': rang });
    }
    if (m === 'POST') {
      const nous = [].concat(JSON.parse(req.postData())).map((d) => ({ id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...d }));
      BD[taula].push(...nous);
      return json(201, filtra(nous, new URLSearchParams({ select: url.searchParams.get('select') || '*' })));
    }
    if (m === 'PATCH') {
      const canvis = JSON.parse(req.postData());
      const f = filtra(vis, new URLSearchParams([...url.searchParams].filter(([k]) => k !== 'select')));
      f.forEach((x) => Object.assign(BD[taula].find((y) => (y.id ?? y.clau) === (x.id ?? x.clau)), canvis));
      return json(200, f.map((x) => ({ id: x.id, clau: x.clau })));
    }
    if (m === 'DELETE') {
      const f = filtra(vis, new URLSearchParams([...url.searchParams].filter(([k]) => k !== 'select')));
      BD[taula] = BD[taula].filter((y) => !f.some((x) => x.id === y.id));
      return json(200, f.map((x) => ({ id: x.id })));
    }
  }
  return json(404, {});
}
const CONFIG = `window.DEFENSEM = { instagram: "", supabaseUrl: "${SB}", supabaseAnonKey: "anon-de-prova" };`;
const CONFIG_BUIT = 'window.DEFENSEM = { instagram: "", supabaseUrl: "", supabaseAnonKey: "" };';
const IG = 'https://www.instagram.com/defensem_prova/';
const CONFIG_IG = `window.DEFENSEM = { instagram: "${IG}", supabaseUrl: "", supabaseAnonKey: "" };`;
const CAPTURES = process.env.CAPTURES || '';  // carpeta on desar captures (opcional)

// ---------------- navegador ----------------
const CC_JS = await readFile(join(ARREL, 'js/consentiment.js'), 'utf8');
const CC_CLAU = CC_JS.match(/var CLAU = '([^']+)'/)[1], CC_VERSIO = CC_JS.match(/var VERSIO = '([^']+)'/)[1];
const nav = await chromium.launch();
const MOBIL = { width: 390, height: 844 }, ESCRIPTORI = { width: 1280, height: 900 };
async function pagina(viewport, ambSupabase, opcions) {
  const ctx = await nav.newContext({ viewport, ...(opcions || {}) });
  // El bàner de cookies es prova a prova-cookies.mjs; aquí es parteix d'una decisió ja presa perquè no tapi res.
  await ctx.addInitScript(([clau, versio]) => {
    try { localStorage.setItem(clau, JSON.stringify({ versio, data: new Date().toISOString(), categories: { analitiques: false } })); } catch { /* about:blank */ }
  }, [CC_CLAU, CC_VERSIO]);
  const pg = await ctx.newPage();
  pg.errors = []; pg.externes = []; pg.dialegs = [];
  // La CSP va en mode Report-Only: no bloqueja, però cada infracció surt com a error de consola i aquí es compta.
  // Excepció: Chrome també avisa quan només *analitza* un atribut onerror/onclick/style (fins i tot dins el document inert de DOMParser),
  // i les dades simulades porten aposta HTML maliciós per provar Segur.neteja. Aquests avisos van a pg.cspAtributs i es proven a part;
  // a les pàgines sense aquestes dades (secció 1, joc) han de ser zero.
  pg.cspAtributs = [];
  pg.on('console', (m) => { const t = m.text();
    if (/Content Security Policy/i.test(t) && /inline event handler|Applying inline style/i.test(t)) pg.cspAtributs.push(t);
    else if (m.type() === 'error' || /Content Security Policy/i.test(t)) pg.errors.push(t); });
  pg.on('pageerror', (e) => pg.errors.push(e.message));
  pg.on('dialog', (d) => { pg.dialegs.push(d.message()); d.dismiss(); });
  pg.on('request', (r) => { if (!r.url().startsWith(ORIGEN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) pg.externes.push(r.url()); });
  pg.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(ORIGEN)) pg.errors.push(r.status() + ' ' + r.url()); });
  // Mai el config.js real: les proves no han de tocar el Supabase de producció.
  await pg.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: ambSupabase ? CONFIG : CONFIG_BUIT }));
  if (ambSupabase) {
    await pg.route(SB + '/**', supabaseFals);
  }
  return pg;
}
const desbordament = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const textos = (pg, sel) => pg.$$eval(sel, (l) => l.map((e) => e.textContent.trim()));
const tokens = (pg) => pg.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('auth-token')).length);

// Botó d'ull d'un camp de contrasenya: alterna el type sense tocar el valor, amb focus, cursor, ARIA i teclat.
async function provaUll(pg, id, etiqueta, tactil) {
  const camp = '#' + id, boto = 'button[aria-controls="' + id + '"]';
  const estat = () => pg.$eval(boto, (b) => { const i = document.getElementById(b.getAttribute('aria-controls'));
    return { type: i.type, valor: i.value, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), focus: document.activeElement === i,
      cursor: i.selectionStart, tipus: b.type, svg: b.querySelectorAll('svg path').length }; });
  const peticionsAbans = peticions.length;
  await pg.fill(camp, 'Secret és 123');
  await pg.$eval(camp, (i) => { i.focus(); i.setSelectionRange(4, 4); });
  let e = await estat();
  comprova(etiqueta + ': amagat d’entrada (password, «Mostrar contrasenya», aria-pressed=false)', e.type === 'password' && e.label === 'Mostrar contrasenya' && e.pressed === 'false' && e.tipus === 'button' && e.svg === 2, JSON.stringify(e));
  await (tactil ? pg.tap(boto) : pg.click(boto));
  e = await estat();
  comprova(etiqueta + ': ' + (tactil ? 'tocar' : 'clicar') + ' mostra (text, «Amagar contrasenya», aria-pressed=true, ull tatxat)', e.type === 'text' && e.label === 'Amagar contrasenya' && e.pressed === 'true' && e.svg === 3, JSON.stringify(e));
  comprova(etiqueta + ': valor intacte, focus i cursor al camp', e.valor === 'Secret és 123' && e.focus && e.cursor === 4, JSON.stringify(e));
  await (tactil ? pg.tap(boto) : pg.click(boto));
  e = await estat();
  comprova(etiqueta + ': tornar a ' + (tactil ? 'tocar' : 'clicar') + ' amaga', e.type === 'password' && e.label === 'Mostrar contrasenya' && e.pressed === 'false' && e.valor === 'Secret és 123', JSON.stringify(e));
  await pg.focus(boto); await pg.keyboard.press('Enter');
  const ambEnter = (await estat()).type;
  await pg.keyboard.press('Space');
  comprova(etiqueta + ': teclat (Enter mostra, Espai amaga)', ambEnter === 'text' && (await estat()).type === 'password');
  const mida = await pg.$eval(boto, (b) => { const r = b.getBoundingClientRect(), c = document.getElementById(b.getAttribute('aria-controls')).getBoundingClientRect();
    return { w: r.width, h: r.height, dins: r.left >= c.left && r.right <= c.right, centre: Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2) };
  });
  comprova(etiqueta + ': botó ≥ 44 px, dins del camp i centrat verticalment', mida.w >= 44 && mida.h >= 44 && mida.dins && mida.centre <= 1, JSON.stringify(mida));
  comprova(etiqueta + ': el botó no envia el formulari', peticions.length === peticionsAbans);
}

const PAGINES = ['/', '/joc.html', '/qui-som.html', '/actualitat.html', '/noticies-defensem.html', '/noticies-renovables.html', '/projecte-la-tallada.html', '/projecte-albons.html', '/documents.html', '/entitats.html', '/eines.html', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html?id=no-valid',
  '/area-privada/', '/area-privada/contrasenya.html', '/area-privada/panel.html'];

console.log('\n1. Totes les pàgines sense Supabase (mòbil 390 px i escriptori 1280 px)');
const enllacos = new Set();
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const ruta of PAGINES) {
    const pg = await pagina(vp, false);
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    if (ruta.startsWith('/area-privada/contrasenya')) await pg.waitForTimeout(300);
    const d = await desbordament(pg);
    comprova(`${ruta} @${vp.width}px: sense errors de consola, sense desbordament, sense recursos externs`,
      pg.errors.length === 0 && pg.cspAtributs.length === 0 && d <= 0 && pg.externes.length === 0, JSON.stringify({ errors: pg.errors, csp: pg.cspAtributs, d, ext: pg.externes }));
    (await pg.$$eval('a[href]', (l) => l.map((a) => a.getAttribute('href')))).forEach((h) => { if (h.startsWith('/')) enllacos.add(h.split('#')[0] || '/'); });
    await pg.context().close();
  }
}

console.log('\n2. Enllaços interns');
for (const h of enllacos) { const r = await fetch(ORIGEN + h); comprova('carrega ' + h, r.status === 200, r.status); }

console.log('\n3. Web en pàgines: portada-resum, una pàgina per secció i capçalera i peu comuns');
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSf6IsYYaV5FMGA-Qw-Khk-ff-6PxW5JrYaxLETymXJ7eg7CJg/viewform';
// [ruta, data-pagina, enllaç del menú marcat (o null), títol]
const SECCIONS = [
  ['/', 'inici', null, 'Defensem l’Empordanet · No al parc eòlic'],
  ['/qui-som.html', 'qui-som', '/qui-som.html', 'Qui som · Defensem l’Empordanet'],
  ['/actualitat.html', 'actualitat', '/actualitat.html', 'Actualitat · Defensem l’Empordanet'],
  ['/noticies-defensem.html', 'noticies-defensem', '/noticies-defensem.html', 'Notícies de Defensem · Defensem l’Empordanet'],
  ['/noticies-renovables.html', 'noticies-renovables', '/noticies-renovables.html', 'Notícies d’energies renovables · Defensem l’Empordanet'],
  ['/projecte-la-tallada.html', 'projecte-la-tallada', '/projecte-la-tallada.html', 'Aerogeneradors de La Tallada · Defensem l’Empordanet'],
  ['/projecte-albons.html', 'projecte-albons', '/projecte-albons.html', 'Aerogenerador d’Albons · Defensem l’Empordanet'],
  ['/documents.html', 'documents', '/documents.html', 'Informació · Defensem l’Empordanet'],
  ['/entitats.html', 'entitats', '/entitats.html', 'Entitats · Defensem l’Empordanet'],
  ['/eines.html', 'eines', '/eines.html', 'Eines · Defensem l’Empordanet'],
  ['/noticia.html', 'noticies-defensem', '/noticies-defensem.html', null]];
const MENU_HREFS = '/qui-som.html,/actualitat.html,/noticies-defensem.html,/noticies-renovables.html,/projecte-la-tallada.html,/projecte-albons.html,/documents.html,/entitats.html,/eines.html';
{
  const pg = await pagina(ESCRIPTORI, false);
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
  comprova('portada: només el bloc principal (hero)', JSON.stringify(await pg.$$eval('main > *', (l) => l.map((s) => s.id || s.className))) === JSON.stringify(['hero']),
    JSON.stringify(await pg.$$eval('main > *', (l) => l.map((s) => s.id || s.className))));
  comprova('portada: cap altra secció (notícies, agenda, entitats, eines…)', !(await pg.$('main :is(#news, #propers, #actes, #ent-llista, #eines-llista, .accessos, #qui-som, #el-projecte, #preguntes, #contacte, #joc, [data-fora-molins])')));
  comprova('menú: Qui som · Actualitat ▾ · Projectes ▾ · Recursos ▾ (el logo porta a Inici)', (await textos(pg, '#nav > ul > li > a, #nav > ul > li > .desp-cap > :first-child')).join() === 'Qui som,Actualitat,Projectes,Recursos'
    && (await textos(pg, '#sub-actualitat a')).join() === 'Notícies de Defensem,Notícies d’energies renovables'
    && (await textos(pg, '#sub-projectes a')).join() === 'Aerogeneradors de La Tallada,Aerogenerador d’Albons'
    && (await textos(pg, '#sub-recursos a')).join() === 'Informació,Entitats,Eines'
    && (await pg.getAttribute('header .logo', 'href')) === '/' && (await pg.getAttribute('header .logo', 'aria-current')) === 'page');
  comprova('menú (escriptori): els submenús estan tancats i s’obren amb el seu botó (aria-expanded)', await pg.$eval('#sub-projectes', (u) => !u.offsetParent)
    && (await pg.getAttribute('#nav .desp-t[aria-controls=sub-projectes]', 'aria-expanded')) === 'false');
  await pg.focus('#nav [aria-controls=sub-projectes]'); await pg.keyboard.press('Enter');
  comprova('menú (escriptori): «Projectes» obre el seu submenú; Escape el tanca i torna el focus al botó', await pg.$eval('#sub-projectes', (u) => !!u.offsetParent)
    && (await pg.getAttribute('#nav [aria-controls=sub-projectes]', 'aria-expanded')) === 'true'
    && await (async () => { await pg.keyboard.press('Escape'); return pg.evaluate(() => !document.getElementById('sub-projectes').offsetParent && document.activeElement.getAttribute('aria-controls') === 'sub-projectes'); })());
  comprova('logo del hero en alta resolució (640 × 468, WebP)', await pg.$eval('.hero-logo', (p) => p.querySelector('source').srcset === '/img/logo-defensem-2x.webp'
    && p.querySelector('img').getAttribute('src') === '/img/logo-defensem-2x.png' && p.querySelector('img').getAttribute('width') === '640' && p.querySelector('img').getAttribute('height') === '468'
    && p.querySelector('img').naturalWidth >= 640));
  comprova('titular «No al parc eòlic!» i il·lustració de molins', (await pg.textContent('.hero h1')).startsWith('No al parc eòlic!') && !!(await pg.$('.hero .molins')));
  const h = await pg.$eval('.hero .cta a.btn:not(.o)', (a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent, label: a.getAttribute('aria-label') }));
  comprova('portada: «Signa la petició» porta al formulari de Google en una pestanya nova', h.href === FORM && h.text === 'Signa la petició' && h.target === '_blank'
    && h.rel === 'noopener noreferrer' && h.label === 'Signa la petició (s’obre en una pestanya nova, formulari de Google)', JSON.stringify(h));
  comprova('portada: sense el recuadre del QR', !(await pg.$('.qr-peticio, img[src*="qr"]')));
  const lg = await pg.evaluate(() => { const t = document.querySelector('.hero-text').getBoundingClientRect(), l = document.querySelector('.hero-logo').getBoundingClientRect();
    return { dt: Math.abs((t.top + t.bottom) / 2 - (l.top + l.bottom) / 2), dreta: l.left > t.right }; });
  comprova('portada: logo a la dreta, centrat verticalment amb el titular', lg.dreta && lg.dt <= 2, JSON.stringify(lg));
  comprova('el segon botó del hero, «Els projectes», porta a la pàgina de La Tallada', (await pg.$eval('.hero .cta a.btn.o', (a) => [a.getAttribute('href'), a.textContent].join())) === '/projecte-la-tallada.html,Els projectes');
  comprova('el formulari de Google no està incrustat', !(await pg.$('iframe[src*="docs.google.com"]')));
  comprova('cap cookie i al localStorage només la clau de consentiment', (await pg.context().cookies()).length === 0 &&
    (await pg.evaluate(() => Object.keys(localStorage).join())) === CC_CLAU);

  for (const [ruta, clau, actual, titol] of [...SECCIONS, ['/avis-legal.html', '', null, null], ['/privacitat.html', '', null, null], ['/cookies.html', '', null, null],
    ['/preferencies-cookies.html', '', null, null], ['/404.html', '', null, null]]) {
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    const p = await pg.evaluate(() => ({ legal: [...document.querySelectorAll('footer .legal a')].map((a) => a.textContent.trim()),
      peus: document.querySelectorAll('footer').length, caps: document.querySelectorAll('header').length,
      privada: !!document.querySelector('footer a[href^="/area-privada"]'), petit: document.querySelector('footer .small')?.textContent,
      menu: [...document.querySelectorAll('#nav a')].map((a) => a.getAttribute('href')).join(),
      actual: [...document.querySelectorAll('#nav a[aria-current=page]')].map((a) => a.getAttribute('href')).join(),
      clau: document.body.getAttribute('data-pagina'),
      peticio: (() => { const a = document.querySelector('header .btn-peticio'); return a && [a.textContent, a.getAttribute('href'), a.target, a.rel].join('|'); })(),
      salta: (() => { const a = document.querySelector('body > a.salta'); const t = a && document.querySelector(a.getAttribute('href'));
        return !!(a && a.textContent === 'Salta al contingut' && t && t.tagName === 'MAIN' && t.id === 'inici' && a === document.body.querySelector('a, header')); })(),
      css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')).join(),
      titol: document.title, desc: document.querySelector('meta[name=description]')?.content,
      og: ['og:title', 'og:description', 'og:image'].map((k) => document.querySelector(`meta[property="${k}"]`)?.content || '').every(Boolean),
      esquema: document.querySelector('meta[name="color-scheme"]')?.content }));
    comprova(`${ruta}: una sola capçalera i un sol peu, posats per /js/marc.js`, p.caps === 1 && p.peus === 1 && !(await (await fetch(ORIGEN + ruta)).text()).includes('<footer'));
    comprova(`${ruta}: peu amb els enllaços legals i el text petit`, !p.privada && p.legal.join() === 'Avís legal,Política de privacitat,Política de cookies,Preferències de cookies'
      && p.petit === 'Web de la iniciativa ciutadana Defensem l’Empordanet · defensemlempordanet@gmail.com · Instagram', JSON.stringify([p.legal, p.petit]));
    comprova(`${ruta}: menú de pàgines amb l’actual marcada`, p.menu === MENU_HREFS
      && p.clau === clau && p.actual === (actual || ''), JSON.stringify({ menu: p.menu, actual: p.actual, clau: p.clau }));
    comprova(`${ruta}: botó «Signa la petició» a la capçalera`, p.peticio === `Signa la petició|${FORM}|_blank|noopener noreferrer`, p.peticio);
    comprova(`${ruta}: «Salta al contingut» és el primer element i porta al <main id="inici">`, p.salta);
    comprova(`${ruta}: estils site.css → afegits.css → pagines.css (amb la versió de memòria cau ?v=6)`, /\/css\/site\.css\?v=6,\/css\/afegits\.css\?v=6,\/css\/pagines\.css\?v=6/.test(p.css), p.css);
    comprova(`${ruta}: mode clar forçat (color-scheme light)`, p.esquema === 'light', p.esquema);
    if (titol) comprova(`${ruta}: <title>, description i Open Graph propis`, p.titol === titol && !!p.desc && p.og, JSON.stringify({ t: p.titol, d: p.desc }));
    if (ruta !== '/') {
      await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
      await pg.keyboard.press('Tab');
      const primer = await pg.evaluate(() => document.activeElement.textContent);
      await pg.keyboard.press('Enter');
      comprova(`${ruta}: amb el teclat, «Salta al contingut» és el primer focus i el porta al <main>`, primer === 'Salta al contingut' && (await pg.evaluate(() => document.activeElement.id)) === 'inici', primer);
    }
  }
  const titols = new Set();
  for (const [ruta] of SECCIONS.slice(0, 11)) { const t = (await (await fetch(ORIGEN + ruta)).text()).match(/<title>([^<]+)/)[1]; titols.add(t); }
  comprova('cada pàgina té un <title> diferent', titols.size === 11, [...titols].join(' | '));

  console.log('\n3a. El contingut de la portada antiga és a la seva pàgina');
  await pg.goto(ORIGEN + '/qui-som.html', { waitUntil: 'networkidle' });
  comprova('Qui som: text, foto i els 5 valors', /Som una iniciativa ciutadana/.test(await pg.textContent('main')) && (await pg.$$('.valors li')).length === 5 && !!(await pg.$('.foto img')));
  await pg.$eval('.foto img', (i) => i.scrollIntoView()); await pg.waitForTimeout(400);
  comprova('Qui som: la foto carrega', await pg.$eval('.foto img', (i) => i.complete && i.naturalWidth > 0));
  comprova('Qui som: sense barra de botons ni bloc «El projecte»; text, valors, El PLATER, «Per què ens hi oposem» i preguntes al final', !(await pg.$('.subnav, #el-projecte, .projecte, [data-text="el-projecte"]'))
    && (await pg.$$eval('main > section.s', (l) => l.map((x) => x.id).join())) === 'qui-som,preguntes'
    && (await textos(pg, '#qui-som .subtitol')).join() === 'El PLATER,Per què ens hi oposem' && (await pg.$$('#qui-som .impactes li')).length === 6
    && /segon període d’informació pública/.test(await pg.textContent('#qui-som .plater')) && (await textos(pg, '#qui-som .plater .fonts a')).join() === '3Cat,Nació Digital'
    && (await pg.$$('#preguntes details')).length === 6 && !(await pg.$('#joc, [data-fora-molins]')) && !(await pg.$('link[href*="joc.css"], script[src*="joc.js"]')));
  comprova('Qui som: «Què puc fer jo?» porta a l’agenda i al contacte del peu; «On anirien els molins?», a les dues pàgines de projecte', !!(await pg.$('#preguntes a[href="/actualitat.html#agenda"]')) && !!(await pg.$('#preguntes a[href="#contacte"]'))
    && !!(await pg.$('footer #contacte')) && !(await pg.$('a[href="#actua"]')) && !!(await pg.$('#preguntes a[href="/projecte-la-tallada.html"]')) && !!(await pg.$('#preguntes a[href="/projecte-albons.html"]')));
  await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
  comprova('Actualitat: blocs Notícies de Defensem, Notícies d’energies renovables i Agenda, amb navegació interna', (await pg.$$eval('.subnav a', (l) => l.map((a) => a.getAttribute('href')))).join() === '#noticies,#renovables,#agenda'
    && (await pg.textContent('#noticies h2')) === 'Notícies de Defensem' && (await pg.textContent('#renovables h2')) === 'Notícies d’energies renovables' && (await pg.textContent('#agenda h2')) === 'Agenda d’actes');
  comprova('Actualitat: la llista d’actes', (await pg.$$('#actes .acte, #actes-fets .acte')).length === 3);
  comprova('Actualitat sense notícies: targetes «Pròximament» i cap «Veure-les totes»', (await textos(pg, '#noticies .proximament, #renovables .proximament')).join('|')
    === 'PròximamentAviat hi trobareu les notícies de Defensem.|PròximamentAviat hi trobareu notícies d’energies renovables.'
    && await pg.$eval('#totes-defensem', (a) => a.hidden && !a.offsetParent) && await pg.$eval('#totes-renovables', (a) => a.hidden));
  comprova('Actualitat: els actes passats, a «Actes anteriors», tancat', await pg.$eval('#actes-anteriors', (d) => !d.open && d.querySelector('summary').textContent === 'Actes anteriors'));
  for (const [ruta, sel, frase] of [['/noticies-defensem.html', '#news', 'Aviat hi trobareu les notícies de Defensem.'], ['/noticies-renovables.html', '#news', 'Aviat hi trobareu notícies d’energies renovables.'],
    ['/projecte-la-tallada.html', '#projecte-info', 'Aviat hi trobareu la informació del projecte.'], ['/projecte-albons.html', '#projecte-info', 'Aviat hi trobareu la informació del projecte.'],
    ['/documents.html', '#documents-llista', 'Aviat hi trobareu documents per descarregar.'], ['/entitats.html', '#ent-llista', 'Aviat hi trobareu les entitats adherides.'],
    ['/eines.html', '#eines-llista', 'Aviat hi trobareu eines per analitzar el territori.']]) {
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    comprova(`${ruta} sense contingut: targeta «Pròximament» (mai en blanc ni amb textos d’exemple)`, (await pg.textContent(sel + ' .proximament .prox-k')) === 'Pròximament'
      && (await pg.textContent(sel + ' .proximament .prox-t')) === frase && !/lorem|exemple/i.test(await pg.textContent('main')));
  }
  await pg.goto(ORIGEN + '/projecte-albons.html', { waitUntil: 'networkidle' });
  comprova('projecte: mateixa plantilla amb Documents i Notícies relacionades («Pròximament» si no n’hi ha)', (await textos(pg, '.projecte-cos h2')).join() === 'Documents,Notícies relacionades'
    && (await pg.$$('.projecte-cos .proximament')).length === 3);
  comprova('Entitats i Eines: sense cercador ni filtres ni formulari d’adhesió', !(await pg.$('#ent-filtres, #ent-cerca, #eines-filtre, .filtre-btn, input[type=search], #adhesio, main form')));
  comprova('peu: sense «Què hi pots fer»; lema a l’esquerra i Contacte (correu i Instagram) a la dreta', !(await pg.$('footer #actua, footer .peu-accions, footer .btn-peu'))
    && !/Què hi pots fer/.test(await pg.textContent('footer')) && (await pg.textContent('footer #contacte h2')) === 'Contacte'
    && !!(await pg.$('footer #contacte a[href="mailto:defensemlempordanet@gmail.com"]')) && !!(await pg.$('footer #contacte a[href="https://www.instagram.com/defensemlempordanet/"]'))
    && await pg.evaluate(() => { const m = document.querySelector('.peu-marca').getBoundingClientRect(), c = document.querySelector('.peu-contacte').getBoundingClientRect(),
      w = document.querySelector('footer .peu-graella').getBoundingClientRect(), pad = parseFloat(getComputedStyle(document.querySelector('footer .peu-graella')).paddingRight);
      return m.left < c.left && Math.abs(c.right - (w.right - pad)) <= 2 && Math.abs(m.top - c.top) <= 2; }));

  console.log('\n3e. Enllaços antics (pàgines i àncores) → pàgina nova');
  for (const [antic, nou] of [['/#noticies', '/noticies-defensem.html'], ['/#agenda', '/actualitat.html#agenda'], ['/#qui-som', '/qui-som.html'],
    ['/#el-projecte', '/projecte-la-tallada.html'], ['/qui-som.html#el-projecte', '/projecte-la-tallada.html'], ['/#preguntes', '/qui-som.html#preguntes'], ['/#entitats', '/entitats.html'], ['/#eines', '/eines.html'],
    ['/projecte.html', '/projecte-la-tallada.html'], ['/agenda.html', '/actualitat.html#agenda'], ['/noticies.html', '/noticies-defensem.html'],
    ['/recursos.html', '/entitats.html'], ['/recursos.html#entitats', '/entitats.html#entitats'], ['/recursos.html#eines', '/eines.html'], ['/contacte.html', '/#contacte']]) {
    await pg.goto(ORIGEN + antic); await pg.waitForURL((u) => (u.pathname !== '/' || nou.startsWith('/#')) && u.pathname + u.hash !== antic && !/recursos/.test(u.pathname) && !(antic === '/recursos.html#eines' && u.pathname === '/entitats.html'), { timeout: 5000 }).catch(() => {});
    const u = new URL(pg.url());
    comprova(`${antic} → ${nou}`, u.pathname + u.hash === nou, u.pathname + u.hash);
  }
  await pg.goto('about:blank'); await pg.goto(ORIGEN + '/#joc'); await pg.waitForURL('**/joc', { timeout: 5000 }).catch(() => {});
  comprova('/#joc (enllaç antic) → /joc, l’app del joc', new URL(pg.url()).pathname === '/joc');
  {
    const { readdir } = await import('node:fs/promises');
    const amb = [];
    for (const f of (await readdir(ARREL)).filter((x) => x.endsWith('.html'))) if (/data-fora-molins|fora-molins\/joc\.(js|css)/.test(await readFile(join(ARREL, f), 'utf8'))) amb.push(f);
    comprova('el joc no és a cap pàgina de la web, només a joc.html', amb.join() === 'joc.html', amb.join());
    const menu = await readFile(join(ARREL, 'js/marc.js'), 'utf8'), mapa = await readFile(join(ARREL, 'sitemap.xml'), 'utf8');
    comprova('/joc no surt al menú ni al sitemap.xml', !/\/joc/.test(menu) && !/\/joc/.test(mapa));
  }
  for (const h of ['#contacte']) {
    await pg.goto(ORIGEN + '/' + h, { waitUntil: 'networkidle' });
    comprova(`/${h} no redirigeix: és al peu de la mateixa pàgina`, new URL(pg.url()).pathname === '/' && !!(await pg.$('footer ' + h)));
  }
  await pg.goto(ORIGEN + '/#inici');
  comprova('/#inici (salt al contingut) no redirigeix', new URL(pg.url()).pathname === '/');
  const ap = await fetch(ORIGEN + '/area-privada/');
  comprova('l’àrea privada continua funcionant a /area-privada/ (sense enllaç al peu)', ap.status === 200 && /Àrea privada/.test(await ap.text()));
  await pg.goto(ORIGEN + '/noticia.html?id=00000000-0000-0000-0000-000000000000', { waitUntil: 'networkidle' });
  comprova('notícia inexistent: missatge i enllaç a les notícies', /No hem trobat aquesta publicació/.test(await pg.textContent('main')) && !!(await pg.$('main a[href="/noticies-defensem.html"]')));

  console.log('\n3f. La capçalera fixa no tapa el titular ni els blocs on porten les àncores');
  for (const vp of [MOBIL, ESCRIPTORI]) {
    const pt = await pagina(vp, false);
    await pt.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
    const h = await pt.evaluate(() => { const c = document.querySelector('header.cap'), t = document.querySelector('.hero h1'), k = document.querySelector('.hero .kicker');
      return { fixa: getComputedStyle(c).position, baixCap: c.getBoundingClientRect().bottom, dalt: Math.min(t.getBoundingClientRect().top, k.getBoundingClientRect().top),
        var: getComputedStyle(document.documentElement).getPropertyValue('--alt-cap'), alt: c.offsetHeight }; });
    comprova(`/ @${vp.width}px: el titular «No al parc eòlic!» es veu sencer sota la capçalera fixa`, h.fixa === 'fixed' && h.dalt >= h.baixCap && h.var.trim() === h.alt + 'px', JSON.stringify(h));
    for (const [ruta, sel] of [['/qui-som.html#preguntes', '#preguntes h2'], ['/actualitat.html#agenda', '#agenda h2'], ['/actualitat.html#renovables', '#renovables h2']]) {
      await pt.goto(ORIGEN + ruta, { waitUntil: 'networkidle' }); await pt.waitForTimeout(700);
      const t = await pt.evaluate((s) => ({ titol: document.querySelector(s).getBoundingClientRect().top, cap: document.querySelector('header.cap').getBoundingClientRect().bottom }), sel);
      comprova(`${ruta} @${vp.width}px: el bloc queda sota la capçalera`, t.titol >= t.cap, JSON.stringify(t));
    }
    await pt.context().close();
  }

console.log('\n4. Segur.neteja');
  await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
  const r = await pg.evaluate(() => {
    const brut = '<h2>Títol</h2><script>window.__xss=1</script><img src=x onerror="window.__xss=2"><a href="javascript:window.__xss=3">a</a>'
      + '<a href=" JaVaScRiPt:alert(1)">b</a><p style="color:red" onclick="window.__xss=4">p</p><b>neg</b><i>cur</i><div>div</div>'
      + '<iframe src="https://x"></iframe><svg><script>window.__xss=5</script></svg><style>*{}</style><span class="x">dins</span>'
      + '<a href="https://exemple.cat" onclick="x">bo</a><a href="mailto:a@b.cat">correu</a><ul><li>u</li></ul><blockquote>c</blockquote>';
    const d = document.createElement('div'); d.appendChild(Segur.neteja(brut)); document.body.appendChild(d);
    const out = d.innerHTML; d.remove(); return { out, xss: window.__xss };
  });
  comprova('elimina <script>', !/<script/i.test(r.out));
  comprova('elimina onerror/onclick', !/onerror|onclick/i.test(r.out));
  comprova('elimina javascript:', !/javascript:/i.test(r.out));
  comprova('elimina estils i classes', !/style|class=/i.test(r.out));
  comprova('elimina iframe, svg i img', !/<iframe|<svg|<img/i.test(r.out));
  comprova('no s’executa cap codi', r.xss === undefined && pg.dialegs.length === 0);
  comprova('B→strong, I→em, DIV→p', r.out.includes('<strong>neg</strong>') && r.out.includes('<em>cur</em>') && r.out.includes('<p>div</p>'));
  comprova('conserva el text dels elements no permesos', r.out.includes('dins'));
  comprova('enllaços bons amb rel i target', r.out.includes('<a href="https://exemple.cat/" rel="noopener noreferrer" target="_blank">bo</a>') && r.out.includes('href="mailto:a@b.cat"'));
  comprova('conserva h2, ul/li, blockquote', /<h2>Títol<\/h2>/.test(r.out) && r.out.includes('<ul><li>u</li></ul>') && r.out.includes('<blockquote>c</blockquote>'));
  await pg.context().close();
}

console.log('\n3b. Molins que giren i tipografia de la Bíblia d’estils (390 px i 1280 px)');
for (const vp of [MOBIL, ESCRIPTORI]) {
  const pg = await pagina(vp, false);
  const imatges = [];
  pg.on('response', (r) => { if (/\/img\/molins-/.test(r.url())) imatges.push(r.url().split('/').pop()); });
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  const m = await pg.evaluate(() => {
    const caixa = document.querySelector('.molins'), base = caixa.querySelector(':scope > picture img'), cb = caixa.getBoundingClientRect();
    const rotors = [...caixa.querySelectorAll('.rotor img')].map((i) => {
      const cs = getComputedStyle(i), r = { width: i.offsetWidth, height: i.offsetHeight }; // sense el gir aplicat
      return { anim: cs.animationName, dur: cs.animationDuration, delay: cs.animationDelay, iter: cs.animationIterationCount, fn: cs.animationTimingFunction,
        origen: cs.transformOrigin, w: r.width, h: r.height, carregada: i.complete && i.naturalWidth > 0, alt: i.getAttribute('alt'), ocult: i.closest('[aria-hidden=true]') !== null };
    });
    return { w: cb.width, natural: base.naturalWidth, alt: base.alt, wAttr: base.getAttribute('width'), hAttr: base.getAttribute('height'), carregada: base.complete && base.naturalWidth > 0,
      esquerra: cb.left, dreta: innerWidth - cb.right, rotors };
  });
  const nom = `@${vp.width}px`;
  comprova(`molins ${nom}: imatge base carregada, amb alt, width/height i WebP`, m.carregada && m.alt === 'Molins de vent sobre plaques solars' && m.wAttr === '822' && m.hAttr === '367'
    && imatges.includes('molins-solars.webp'), JSON.stringify({ ...m, rotors: undefined, imatges }));
  comprova(`molins ${nom}: mai més ample que la mida real (${m.w.toFixed(0)} ≤ ${m.natural} px)`, m.w <= m.natural + 0.5);
  if (vp === MOBIL) comprova(`molins ${nom}: ocupa l’amplada amb marges de 16 px`, Math.abs(m.esquerra - 16) <= 1 && Math.abs(m.dreta - 16) <= 1, JSON.stringify(m));
  else comprova(`molins ${nom}: centrada`, Math.abs(m.esquerra - m.dreta) <= 1);
  comprova(`molins ${nom}: 5 rotors carregats, decoratius (alt="" i aria-hidden)`, m.rotors.length === 5 && m.rotors.every((r) => r.carregada && r.alt === '' && r.ocult));
  comprova(`molins ${nom}: tots giren (rotate lineal i infinit)`, m.rotors.every((r) => r.anim === 'gira' && r.iter === 'infinite' && r.fn === 'linear'), JSON.stringify(m.rotors));
  comprova(`molins ${nom}: velocitats i fases diferents`, new Set(m.rotors.map((r) => r.dur)).size === 5 && new Set(m.rotors.map((r) => r.delay)).size === 5);
  comprova(`molins ${nom}: el gir és al centre de cada rotor (la boixa)`, m.rotors.every((r) => { const [x, y] = r.origen.split(' ').map(parseFloat); return Math.abs(x - r.w / 2) < 0.5 && Math.abs(y - r.h / 2) < 0.5 && Math.abs(r.w - r.h) < 0.5; }));
  // Només s'anima transform: els fotogrames clau no toquen cap altra propietat.
  const props = await pg.evaluate(() => [...new Set(document.getAnimations().flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)))))]);
  comprova(`molins ${nom}: només s’anima transform`, JSON.stringify(props) === '["transform"]', JSON.stringify(props));
  const f = await pg.evaluate(() => {
    const est = (sel) => { const e = document.querySelector(sel), cs = getComputedStyle(e); return { font: cs.fontFamily.split(',')[0].replace(/["']/g, ''), color: cs.color, pes: cs.fontWeight, mida: parseFloat(cs.fontSize) }; };
    return { h1: est('.hero h1'), sub: est('.hero h1 small'), h2: est('.hero h1 small'), h2span: est('.hero h1'), kicker: est('.kicker'), cos: est('.hero .lead'), h3: est('.hero h1 small'),
      anton: document.fonts.check('1em Anton'), caveat: document.fonts.check('1em "Caveat Brush"') };
  });
  const VERMELL = 'rgb(218, 20, 21)', VERD = 'rgb(41, 141, 59)';
  comprova(`tipografia ${nom}: titular principal en Anton vermell`, f.anton && f.h1.font === 'Anton' && f.h1.color === VERMELL && f.h1.pes === '400', JSON.stringify(f.h1));
  comprova(`tipografia ${nom}: titulars verds gruixuts (subtítol, h2, h3) en verd oficial i prou grans per a AA`, [f.sub, f.h2, f.h3].every((x) => x.color === VERD && +x.pes >= 800)
    && f.sub.mida >= 24 && f.h2.mida >= 24 && f.h3.mida >= 18.66 && f.h2span.color === VERMELL, JSON.stringify([f.sub, f.h2, f.h3]));
  comprova(`tipografia ${nom}: accents manuscrits verds (Caveat Brush, substituta d’Adlery) ≥ 24 px`, f.caveat && f.kicker.font === 'Caveat Brush' && f.kicker.color === VERD && f.kicker.mida >= 24, JSON.stringify(f.kicker));
  comprova(`tipografia ${nom}: text corrent en Open Sans`, f.cos.font === 'Open Sans', JSON.stringify(f.cos));
  const e = await pg.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const sub = r('.hero h1 small'), h1 = r('.hero h1'), lead = r('.hero .lead'), cta = r('.hero .cta'), logo = r('.hero-logo'), mol = r('.molins'), txt = r('.hero-text');
    return { subParagraf: lead.top - sub.bottom, paragrafBotons: cta.top - lead.bottom, botonsMolins: mol.top - cta.bottom, logoParagraf: lead.top - logo.bottom,
      h1Alt: h1.height, logoAlt: logo.height, h1Top: h1.top, logoTop: logo.top, centreText: (txt.top + txt.bottom) / 2, centreLogo: (logo.top + logo.bottom) / 2, logoAmple: logo.width, ordreMobil: h1.bottom <= logo.top && logo.bottom <= lead.top && lead.bottom <= cta.top,
      molinsSencers: mol.bottom <= innerHeight };
  });
  if (vp === ESCRIPTORI) {
    comprova(`hero ${nom}: el paràgraf va just sota el subtítol (${e.subParagraf.toFixed(0)} px ≤ 24)`, e.subParagraf >= 8 && e.subParagraf <= 24, JSON.stringify(e));
    comprova(`hero ${nom}: el logo (300 px) va a la dreta, centrat verticalment amb el bloc del titular`, Math.abs(e.centreText - e.centreLogo) <= 2 && e.logoAmple >= 260 && e.logoAmple <= 300, JSON.stringify(e));
    comprova(`hero ${nom}: els molins es veuen sencers sense desplaçar`, e.molinsSencers, JSON.stringify(e));
  } else {
    comprova(`hero ${nom}: ordre títol → logo → paràgraf → botons, amb 16-24 px del logo al paràgraf`, e.ordreMobil && e.logoParagraf >= 16 && e.logoParagraf <= 24, JSON.stringify(e));
  }
  comprova(`hero ${nom}: botons a 16-26 px del paràgraf i molins a ≤ 24 px dels botons`, e.paragrafBotons >= 16 && e.paragrafBotons <= 26 && e.botonsMolins >= 0 && e.botonsMolins <= 24, JSON.stringify(e));
  if (CAPTURES) {
    await pg.screenshot({ path: `${CAPTURES}/portada-${vp.width}.png` });
    // Fotograma a mitja volta: es pausen les animacions en un instant concret.
    await pg.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 2600; }));
    await (await pg.$('.molins')).screenshot({ path: `${CAPTURES}/molins-gir-${vp.width}.png` });
  }
  await pg.context().close();
}
{
  const pg = await pagina(ESCRIPTORI, false, { reducedMotion: 'reduce' });
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
  comprova('molins: amb prefers-reduced-motion no giren', await pg.$$eval('.rotor img', (l) => l.length === 5 && l.every((i) => getComputedStyle(i).animationName === 'none')));
  await pg.context().close();
}
{
  const pg = await pagina(MOBIL, false);
  await pg.goto(ORIGEN + '/avis-legal.html', { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  const t = await pg.evaluate(() => ({ h1: getComputedStyle(document.querySelector('.doc h1')).fontFamily, h2: getComputedStyle(document.querySelector('.doc h2')).color }));
  comprova('pàgines legals: h1 en Anton i h2 en verd oficial', /^"?Anton/.test(t.h1) && t.h2 === 'rgb(41, 141, 59)', JSON.stringify(t));
  const lg = await pg.evaluate(() => { const h = [...document.querySelectorAll('.doc h2')].find((x) => x.textContent.includes('intel·lectual')), p = h && h.querySelector('.punt-volat');
    return h && { text: h.textContent, marge: p ? parseFloat(getComputedStyle(p).marginLeft) : 0, color: p && getComputedStyle(p).color, colorH2: getComputedStyle(h).color }; });
  comprova('«intel·lectual» es llegeix sencer i el punt volat té aire (no sembla una «H») i el color del titular', !!lg && lg.text === '6. Propietat intel·lectual' && lg.marge >= 1
    && lg.color === lg.colorH2, JSON.stringify(lg));
  if (CAPTURES) await (await pg.$('.doc h2:has(.punt-volat)')).screenshot({ path: `${CAPTURES}/intel-lectual-390.png` });
  await pg.context().close();
}
{
  const pg = await pagina(ESCRIPTORI, true);
  await pg.goto(ORIGEN + '/area-privada/', { waitUntil: 'networkidle' });
  const h1 = await pg.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  comprova('l’àrea privada no canvia de tipografia (Open Sans)', /^"?Open Sans/.test(h1), h1);
  await pg.context().close();
}

console.log('\n3d. Il·lustracions de l’antic «El projecte» a les pàgines de projecte (també sense Supabase)');
{
  for (const vp of [MOBIL, ESCRIPTORI]) {
    const pg = await pagina(vp, false);
    await pg.goto(ORIGEN + '/projecte-la-tallada.html', { waitUntil: 'networkidle' });
    const t = await pg.evaluate(() => { const f = document.querySelector('.projecte-cos > figure.alcada'), r = f && f.querySelector('svg').getBoundingClientRect();
      return f && { titol: f.querySelector('svg title').textContent, peu: f.querySelector('figcaption').textContent, w: Math.round(r.width) }; });
    comprova(`La Tallada @${vp.width}px: comparació amb el Puig Segalar (dibuix de 200 m vs 175 m)`, !!t && /Puig Segalar/.test(t.titol) && t.peu === 'Un molí de 200 m és més alt que el Puig Segalar (175 m).'
      && t.w > 200 && t.w <= 420, JSON.stringify(t));
    comprova(`La Tallada @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    await pg.goto(ORIGEN + '/projecte-albons.html', { waitUntil: 'networkidle' });
    const a = await pg.evaluate(async () => { const f = document.querySelector('.projecte-cos > figure.il-lustracio'), i = f && f.querySelector('img');
      if (i) { i.loading = 'eager'; await i.decode().catch(() => {}); }
      return f && { src: i.getAttribute('src'), alt: i.alt, ok: i.naturalWidth > 0, peu: f.querySelector('figcaption').textContent, w: Math.round(i.getBoundingClientRect().width) }; });
    comprova(`Albons @${vp.width}px: els gegants d’Albons amb el peu de sempre`, !!a && a.src === '/img/projecte/gegants-albons.webp' && /gegants d’Albons/.test(a.alt) && a.ok
      && a.peu === 'Els gegants d’Albons també hi diuen la seva.' && a.w <= 360, JSON.stringify(a));
    comprova(`Albons @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    if (CAPTURES) {
      await pg.goto(ORIGEN + '/qui-som.html', { waitUntil: 'networkidle' });
      await pg.screenshot({ path: `${CAPTURES}/qui-som-${vp.width}.png`, fullPage: true });
      await pg.goto(ORIGEN + '/projecte-la-tallada.html', { waitUntil: 'networkidle' });
      await pg.screenshot({ path: `${CAPTURES}/la-tallada-${vp.width}.png`, fullPage: true });
      await pg.goto(ORIGEN + '/projecte-albons.html', { waitUntil: 'networkidle' });
      await pg.screenshot({ path: `${CAPTURES}/albons-${vp.width}.png`, fullPage: true });
    }
    await pg.context().close();
  }
  const html = (await Promise.all(['/qui-som.html', '/index.html', '/actualitat.html', '/projecte-la-tallada.html', '/projecte-albons.html', '/documents.html', '/entitats.html', '/eines.html',
    '/noticies-defensem.html', '/noticies-renovables.html', '/404.html', '/js/marc.js'].map(async (r) => (await fetch(ORIGEN + r)).text()))).join('');
  comprova('cap enllaç de la web apunta a #el-projecte', !/href="[^"]*#el-projecte"/.test(html));
}

console.log('\n3c. Enllaços legals discrets al final del peu (390 px i 1280 px)');
{
  const LEGALS = [['/avis-legal.html', 'Avís legal'], ['/privacitat.html', 'Política de privacitat'], ['/cookies.html', 'Política de cookies'],
    ['/preferencies-cookies.html', 'Preferències de cookies']];
  const lum = (rgb) => { const c = rgb.match(/\d+/g).slice(0, 3).map((v) => v / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const vp of [MOBIL, ESCRIPTORI]) {
    for (const ruta of ['/', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html?id=no-valid']) {
      const pg = await pagina(vp, false);
      await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
      const nom = `${ruta} @${vp.width}px`;
      const d = await pg.evaluate(() => {
        const peu = document.querySelector('footer'), franja = peu.querySelector('.peu-legal'), ul = franja && franja.querySelector('ul.legal');
        if (!ul) return null;
        const enllacos = [...ul.querySelectorAll('a')].map((a) => { const cs = getComputedStyle(a), r = a.getBoundingClientRect();
          return { href: a.getAttribute('href'), text: a.textContent.trim(), color: cs.color, deco: cs.textDecorationLine, mida: parseFloat(cs.fontSize), font: cs.fontFamily, h: r.height, top: Math.round(r.top), visible: r.width > 0 && r.height > 0 }; });
        const punts = [...ul.querySelectorAll('li')].map((li) => getComputedStyle(li, '::before').content);
        // Retall de la llista: els punts que comencen una fila queden fora; el primer enllaç s'alinea amb la resta del peu.
        const esq = getComputedStyle(ul).clipPath.match(/inset\(([^)]*)\)/)[1].trim().split(/\s+/)[3], em = parseFloat(getComputedStyle(ul).fontSize);
        const visibleDesDe = ul.getBoundingClientRect().left + parseFloat(esq) * (esq.endsWith('em') ? em : 1);
        const capsDeFila = [...ul.querySelectorAll('li')].filter((li, i, l) => i === 0 || li.getBoundingClientRect().top !== l[i - 1].getBoundingClientRect().top);
        // El punt és centrat en una caixa d'1,6em: acaba a ~0,95em de l'inici de l'element.
        const puntsAmagats = capsDeFila.every((li) => li.getBoundingClientRect().left + 0.95 * em <= visibleDesDe);
        const w = peu.querySelector('.w'), wEsq = w.getBoundingClientRect().left + parseFloat(getComputedStyle(w).paddingLeft);
        const primer = ul.querySelector('a').getBoundingClientRect().left;
        const contornVisible = primer - 6 >= visibleDesDe;
        return { ultim: peu.lastElementChild === franja, fons: getComputedStyle(franja).backgroundColor, enllacos, punts, files: new Set(enllacos.map((e) => e.top)).size,
          puntsAmagats, alineat: Math.abs(primer - wEsq) <= 1, contornVisible };
      });
      if (!d) { comprova(`${nom}: hi ha la franja d’enllaços legals al peu`, false); await pg.context().close(); continue; }
      comprova(`${nom}: els 4 enllaços legals, visibles i en ordre, en una franja al final del peu`, d.ultim
        && JSON.stringify(d.enllacos.map((e) => [e.href, e.text])) === JSON.stringify(LEGALS) && d.enllacos.every((e) => e.visible), JSON.stringify(d.enllacos.map((e) => e.text)));
      comprova(`${nom}: separats per punts volats decoratius, cap al començament de fila`, d.punts.every((c) => c.startsWith('"·"')) && d.puntsAmagats, JSON.stringify(d.punts));
      comprova(`${nom}: el primer enllaç s’alinea amb el peu i el seu contorn de focus no es retalla`, d.alineat && d.contornVisible);
      comprova(`${nom}: lletra petita (~.85rem), Open Sans, text-suau, sense subratllat`, d.enllacos.every((e) => Math.abs(e.mida - 13.6) < 0.2 && /^"?Open Sans/.test(e.font)
        && e.color === 'rgb(74, 74, 70)' && e.deco === 'none'), JSON.stringify(d.enllacos[0]));
      comprova(`${nom}: fons oficial i contrast AA (${contrast(d.enllacos[0].color, d.fons).toFixed(2)}:1)`, d.fons === 'rgb(241, 240, 238)' && contrast(d.enllacos[0].color, d.fons) >= 4.5);
      comprova(`${nom}: àrea tàctil ≥ 44 px d’alt`, d.enllacos.every((e) => e.h >= 44), JSON.stringify(d.enllacos.map((e) => e.h)));
      comprova(`${nom}: ${vp === ESCRIPTORI ? 'una sola línia' : 'com a molt dues línies'} (${d.files}), sense desbordament`, d.files <= (vp === ESCRIPTORI ? 1 : 2) && (await desbordament(pg)) <= 0);
      if (ruta === '/') {
        const a = pg.locator('.peu-legal a', { hasText: 'Política de privacitat' });
        await a.hover();
        const hover = await a.evaluate((e) => ({ c: getComputedStyle(e).color, d: getComputedStyle(e).textDecorationLine }));
        comprova(`${nom}: en passar-hi el ratolí, color de text i subratllat`, hover.c === 'rgb(30, 30, 28)' && hover.d === 'underline', JSON.stringify(hover));
        await pg.mouse.move(0, 0);
        await pg.focus('.peu-legal a[href="/cookies.html"]'); await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab');
        const focus = await pg.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e);
          return { text: e.textContent, c: cs.color, d: cs.textDecorationLine, o: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor }; });
        comprova(`${nom}: amb el teclat, focus visible (contorn vermell de 3 px), color de text i subratllat`, focus.text === 'Política de cookies' && focus.o === 'solid 3px rgb(218, 20, 21)'
          && focus.c === 'rgb(30, 30, 28)' && focus.d === 'underline', JSON.stringify(focus));
        await pg.evaluate(() => document.activeElement.blur());
        if (CAPTURES) {
          await pg.evaluate(() => document.querySelector('footer').scrollIntoView({ block: 'end' }));
          await (await pg.$('footer')).screenshot({ path: `${CAPTURES}/peu-legal-${vp.width}.png` });
        }
      }
      await pg.context().close();
    }
  }
}

console.log('\n5. Àrea privada sense configurar');
for (const ruta of ['/area-privada/', '/area-privada/contrasenya.html', '/area-privada/panel.html']) {
  const pg = await pagina(MOBIL, false);
  await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
  comprova(ruta + ' mostra «L\'àrea privada encara no està configurada.»', (await pg.textContent('main')).includes('L\'àrea privada encara no està configurada.'));
  if (ruta === '/area-privada/') {
    comprova('no hi ha botó ni enllaç de registre', !(await textos(pg, 'a, button')).some((t) => /registr|crea un compte|alta|sign up/i.test(t)));
    comprova('el formulari queda desactivat', await pg.$eval('#f-login button', (b) => b.disabled));
  }
  await pg.context().close();
}

console.log('\n6. Amb Supabase simulat: notícies públiques');
{
  const pg = await pagina(MOBIL, true);
  await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
  const pub = BD.publicacions.find((p) => p.estat === 'publicat');
  comprova('mostra només la publicada, amb etiqueta Comunicat', (await pg.$$('#news .card')).length === 1 && (await pg.textContent('#news .etiq')) === 'Comunicat');
  comprova('el títol enllaça a /noticia.html?id= i tota la targeta és clicable', (await pg.getAttribute('#news h3 a', 'href')) === '/noticia.html?id=' + pub.id
    && (await pg.textContent('#news h3 a')) === 'Comunicat publicat');
  await pg.waitForTimeout(300);
  comprova('la imatge ve del bucket públic', /^https:\/\/prova\.supabase\.co\/storage\/v1\/object\/public\/portades\//.test(await pg.getAttribute('#news .card img', 'src') || '')
    && (await pg.getAttribute('#news .card img', 'src')).includes(U.E));
  const q = peticions.find((x) => x.url.startsWith('/rest/v1/publicacions_publiques'));
  comprova('consulta la vista pública (mai la taula)', !!q && !peticions.some((x) => x.url.startsWith('/rest/v1/publicacions?')));
  await pg.goto(ORIGEN + '/noticia.html?id=' + pub.id, { waitUntil: 'networkidle' });
  comprova('pàgina de notícia amb títol (dins el <main id="inici">)', (await pg.textContent('main#inici h1')) === 'Comunicat publicat');
  const html = await pg.$eval('.contingut', (e) => e.innerHTML);
  comprova('el contingut públic arriba net (sense script/onerror/javascript:/style)', !/script|onerror|javascript:|style=|onclick/i.test(html) && html.includes('<strong>important</strong>'));
  comprova('cap codi injectat s’executa a la pàgina pública', (await pg.evaluate(() => window.__xss)) === undefined);
  // L'únic avís de CSP és el de l'HTML maliciós de prova en analitzar-lo (onerror/onclick), no cap recurs ni script de la web.
  comprova('CSP: només avisa dels atributs maliciosos de prova en netejar-los', pg.cspAtributs.length > 0 && pg.errors.every((e) => !/Content Security Policy/i.test(e)), JSON.stringify(pg.errors));
  comprova('sense desbordament ni errors (notícia, mòbil)', (await desbordament(pg)) <= 0 && pg.errors.filter((e) => !/storage\/v1/.test(e)).length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}

console.log('\n6a. Notícies: les 6 més recents i «Carrega’n més» (6 més cada vegada)');
{
  const desades = BD.publicacions;
  const ara = Date.now();
  BD.publicacions = desades.concat(Array.from({ length: 13 }, (_, i) => ({ id: randomUUID(), tipus: 'noticia', titol: 'Notícia ' + (i + 1), resum: 'Un resum prou llarg per ocupar més de dues línies en una targeta compacta i comprovar que es retalla amb punts suspensius al final del text.', contingut: '<p>t</p>', imatge: i === 0 ? U.E + '/foto.jpg' : null,
    estat: 'publicat', nota_revisio: null, autor_id: U.E, created_at: '', updated_at: '', published_at: new Date(ara - (i + 1) * 864e5).toISOString() })));
  for (const vp of [MOBIL, ESCRIPTORI]) {
    peticions = [];
    const pg = await pagina(vp, true);
    await pg.goto(ORIGEN + '/noticies-defensem.html', { waitUntil: 'networkidle' });
    const p1 = await pg.evaluate(() => { const c = document.querySelector('#news .card'), img = document.querySelector('#news img'), p = document.querySelectorAll('#news .resum-2')[1];
      return { n: document.querySelectorAll('#news .card').length, mes: !document.getElementById('news-mes').hidden, text: document.getElementById('news-mes').textContent,
        img: img && [img.loading, img.decoding, img.getAttribute('width') === '640' && img.getAttribute('height') === '360'].join('|'),
        linies: p ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)) : 0, enllac: c.querySelector('h3 a')?.getAttribute('href') }; });
    comprova(`notícies @${vp.width}px: 6 targetes compactes i «Carrega’n més»`, p1.n === 6 && p1.mes && p1.text === 'Carrega’n més' && p1.linies === 2 && /^\/noticia\.html\?id=/.test(p1.enllac), JSON.stringify(p1));
    comprova(`notícies @${vp.width}px: imatges lazy i reduïdes`, p1.img === 'lazy|async|true', p1.img);
    comprova(`notícies @${vp.width}px: es demanen només 6 a Supabase, només de Defensem`, peticions.filter((p) => p.url.startsWith('/rest/v1/publicacions_publiques')).every((p) => /seccio=eq\.defensem/.test(p.url) && /limit=6&offset=0/.test(p.url)));
    await pg.click('#news-mes'); await pg.waitForFunction(() => document.querySelectorAll('#news .card').length === 12, null, { timeout: 8000 }).catch(() => {});
    comprova(`notícies @${vp.width}px: «Carrega’n més» n’afegeix 6 (offset=6)`, (await pg.$$('#news .card')).length === 12 && peticions.some((p) => /limit=6&offset=6/.test(p.url))
      && await pg.$eval('#news-mes', (b) => !b.hidden));
    await pg.click('#news-mes'); await pg.waitForFunction(() => document.querySelectorAll('#news .card').length === 14, null, { timeout: 8000 }).catch(() => {});
    comprova(`notícies @${vp.width}px: quan no en queden, el botó desapareix`, (await pg.$$('#news .card')).length === 14 && await pg.$eval('#news-mes', (b) => b.hidden));
    comprova(`notícies @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.filter((e) => !/storage\/v1/.test(e)).length === 0, JSON.stringify(pg.errors));
    await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
    comprova(`actualitat @${vp.width}px: les 3 últimes de Defensem i «Veure-les totes»`, (await pg.$$('#noticies .card')).length === 3
      && await pg.$eval('#totes-defensem', (a) => !a.hidden && a.getAttribute('href') === '/noticies-defensem.html' && a.textContent === 'Veure-les totes')
      && (await textos(pg, '#noticies h3')).join() === 'Comunicat publicat,Notícia 1,Notícia 2', (await textos(pg, '#noticies h3')).join());
    await pg.context().close();
  }
  BD.publicacions = desades;
}

console.log('\n6c. Notícies d’energies renovables: mitjà, data, resum propi i «Llegeix-la a la font»');
{
  const desades = BD.publicacions;
  BD.publicacions = desades.concat(Array.from({ length: 8 }, (_, i) => ({ id: randomUUID(), tipus: 'noticia', seccio: 'renovables', titol: 'Renovable ' + (i + 1), mitja: 'Mitjà ' + (i + 1),
    resum: 'Resum propi ' + (i + 1), font_url: i === 7 ? 'javascript:alert(1)' : 'https://mitja.exemple.cat/' + (i + 1), data: '2026-10-' + String(20 - i).padStart(2, '0'), contingut: '', imatge: null,
    estat: 'publicat', nota_revisio: null, autor_id: U.E, created_at: '', updated_at: '', published_at: new Date().toISOString() })));
  for (const vp of [MOBIL, ESCRIPTORI]) {
    peticions = [];
    const pg = await pagina(vp, true);
    await pg.goto(ORIGEN + '/noticies-renovables.html', { waitUntil: 'networkidle' });
    const r = await pg.evaluate(() => { const c = document.querySelector('#news .renovable'), a = c.querySelector('a.font');
      return { n: document.querySelectorAll('#news .renovable').length, mitja: c.querySelector('.mitja').textContent, data: c.querySelector('time').textContent, h: c.querySelector('h3').textContent,
        resum: c.querySelector('p').textContent, a: [a.textContent, a.href, a.target, a.rel].join('|'), defensem: document.querySelectorAll('#news .card-compacta').length,
        mes: !document.getElementById('news-mes').hidden }; });
    comprova(`renovables @${vp.width}px: 6 per pàgina amb títol, mitjà, data, resum i «Llegeix-la a la font» (pestanya nova)`, r.n === 6 && r.h === 'Renovable 1' && r.mitja === 'Mitjà 1'
      && r.data === '20 d’octubre del 2026' && r.resum === 'Resum propi 1' && r.a === 'Llegeix-la a la font|https://mitja.exemple.cat/1|_blank|noopener noreferrer' && r.defensem === 0 && r.mes, JSON.stringify(r));
    await pg.click('#news-mes'); await pg.waitForFunction(() => document.querySelectorAll('#news .renovable').length === 8, null, { timeout: 8000 }).catch(() => {});
    comprova(`renovables @${vp.width}px: «Carrega’n més» i cap enllaç javascript:`, (await pg.$$('#news .renovable')).length === 8 && await pg.$eval('#news-mes', (b) => b.hidden)
      && !(await pg.$('#news a[href^="javascript"]')) && peticions.every((p) => !p.url.startsWith('/rest/v1/publicacions_publiques') || /seccio=eq\.renovables/.test(p.url)));
    comprova(`renovables @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
    comprova(`actualitat @${vp.width}px: les 3 últimes de renovables i «Veure-les totes»`, (await pg.$$('#renovables .renovable')).length === 3
      && await pg.$eval('#totes-renovables', (a) => !a.hidden && a.getAttribute('href') === '/noticies-renovables.html'));
    if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/actualitat-${vp.width}.png`, fullPage: true });
    await pg.context().close();
  }
  BD.publicacions = desades;
}

console.log('\n6d. Projectes, documents i textos des de Supabase');
{
  BD = dadesInicials(); peticions = [];
  BD.projectes.push({ id: 'albons', titol: 'Aerogenerador d’Albons', descripcio: 'Primer paràgraf.\n\nSegon paràgraf.', mapa: U.E + '/mapa.jpg', mapa_enllac: 'https://visor.exemple.cat/', situacio: 'En informació pública.', publicada: true },
    { id: 'la-tallada', titol: 'Aerogeneradors de La Tallada', descripcio: 'Ocult', mapa: null, mapa_enllac: null, situacio: '', publicada: false });
  BD.informacio.push({ id: randomUUID(), titol: 'Fulletó', categoria: 'Fulletons', data: '2026-09-25', fitxer: '/docs/fulleto-moli-salancs-albons.pdf', mida: 817473, projecte: 'albons', publicada: true },
    { id: randomUUID(), titol: 'Al·legació model', categoria: 'Al·legacions', data: null, fitxer: U.E + '/' + randomUUID() + '.pdf', mida: 20480, projecte: null, publicada: true },
    { id: randomUUID(), titol: 'Esborrany', categoria: 'Al·legacions', data: null, fitxer: '/docs/fulleto-moli-salancs-albons.pdf', mida: 1, projecte: 'albons', publicada: false });
  BD.publicacions.find((x) => x.estat === 'publicat').projecte = 'albons';
  BD.pagines.push({ clau: 'peu-lema', titol: 'Lema', contingut: 'Lema canviat des de l’app.' }, { clau: 'qui-som', titol: 'Qui som', contingut: 'Paràgraf u.\n\nParàgraf dos.' });
  for (const vp of [MOBIL, ESCRIPTORI]) {
    const pg = await pagina(vp, true);
    await pg.goto(ORIGEN + '/projecte-albons.html', { waitUntil: 'networkidle' });
    const d = await pg.evaluate(() => ({ h2: [...document.querySelectorAll('.projecte-cos h2')].map((h) => h.textContent).join(),
      desc: [...document.querySelectorAll('#descripcio p')].map((p) => p.textContent).join('|'), mapa: document.querySelector('#mapa img')?.getAttribute('src') || '',
      enllac: document.querySelector('#mapa a')?.href, sit: document.querySelector('#situacio .situacio')?.textContent,
      docs: [...document.querySelectorAll('#documents li')].map((l) => l.textContent).join('|'), noticies: [...document.querySelectorAll('#noticies-relacionades h3')].map((h) => h.textContent).join() }));
    comprova(`projecte @${vp.width}px: descripció, mapa, situació actual, documents i notícies relacionades`, d.h2 === 'Descripció,Mapa,Situació actual,Documents,Notícies relacionades'
      && d.desc === 'Primer paràgraf.|Segon paràgraf.' && d.mapa.endsWith('/storage/v1/object/public/portades/' + U.E + '/mapa.jpg') && d.enllac === 'https://visor.exemple.cat/'
      && d.sit === 'En informació pública.' && d.docs === 'PDFFulletó25 de setembre del 2026 · PDF, 0,8 MB' && d.noticies === 'Comunicat publicat', JSON.stringify(d));
    comprova(`projecte @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/projecte-${vp.width}.png`, fullPage: true });
    await pg.goto(ORIGEN + '/projecte-la-tallada.html', { waitUntil: 'networkidle' });
    comprova(`projecte ocult @${vp.width}px: «Pròximament» (no se’n mostra res)`, (await pg.textContent('#projecte-info')) === 'PròximamentAviat hi trobareu la informació del projecte.');
    await pg.goto(ORIGEN + '/documents.html', { waitUntil: 'networkidle' });
    const doc = await pg.evaluate(() => ({ cats: [...document.querySelectorAll('.docs-cat h2')].map((h) => h.textContent).join(),
      links: [...document.querySelectorAll('.docs-llista a')].map((a) => [a.textContent, a.getAttribute('href'), a.target].join('|')).join(' ; '),
      meta: [...document.querySelectorAll('.doc-meta')].map((m) => m.textContent).join(' ; ') }));
    comprova(`documents @${vp.width}px: per categoria, amb títol, data i mida, només els publicats`, doc.cats === 'Al·legacions,Fulletons'
      && /^Al·legació model\|https:\/\/prova\.supabase\.co\/storage\/v1\/object\/public\/informacio\/.+\.pdf\|_blank ; Fulletó\|\/docs\/fulleto-moli-salancs-albons\.pdf\|_blank$/.test(doc.links)
      && doc.meta === 'PDF, 20 kB ; 25 de setembre del 2026 · PDF, 0,8 MB', JSON.stringify(doc));
    comprova(`documents @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    await pg.goto(ORIGEN + '/qui-som.html', { waitUntil: 'networkidle' });
    comprova(`textos @${vp.width}px: els de l’app substitueixen Qui som i el lema del peu`, (await textos(pg, '#qui-som [data-text="qui-som"] p')).join('|') === 'Paràgraf u.|Paràgraf dos.'
      && (await pg.textContent('footer .peu-marca p')) === 'Lema canviat des de l’app.' && !(await pg.$('[data-text="el-projecte"]')));
    await pg.context().close();
  }
  BD = dadesInicials();
}

console.log('\n6b. Instagram: l’oficial al peu, sempre en una pestanya nova (390 px i 1280 px)');
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const ruta of ['/', '/entitats.html', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html?id=no-valid']) {
    const pg = await pagina(vp, false);
    await pg.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: CONFIG_IG }));
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    const peu = await pg.$eval('footer', (f) => ({ ig: [...new Set([...f.querySelectorAll('a[href*="instagram"]')].map((a) => [a.href, a.target, a.rel].join()))],
      dinamic: f.querySelectorAll('.ig, #ig-peu').length, buits: [...f.querySelectorAll('.w > *')].filter((e) => !e.textContent.trim() && !e.children.length).length }));
    comprova(`${ruta} @${vp.width}px: el peu només enllaça a l’Instagram oficial, en pestanya nova, i cap element buit`,
      peu.ig.join('|') === 'https://www.instagram.com/defensemlempordanet/,_blank,noopener noreferrer' && peu.dinamic === 0 && peu.buits === 0, JSON.stringify(peu));
    comprova(`${ruta} @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    if (CAPTURES && ruta === '/') {
      const clip = await pg.evaluate(() => { const b = document.querySelector('footer').getBoundingClientRect(); return { x: 0, y: b.top + scrollY, width: document.documentElement.clientWidth, height: b.height }; });
      await pg.screenshot({ path: `${CAPTURES}/peu-${vp.width}.png`, fullPage: true, clip });
    }
    await pg.context().close();
  }
}

const editaVisible = (pg) => pg.$$eval('#vista tbody tr a.btn', (l) => l.every((a) => { const r = a.getBoundingClientRect(), w = a.closest('.taula-wrap').getBoundingClientRect();
  return r.left >= w.left && r.right <= w.right + 1 && r.right <= document.documentElement.clientWidth; }));
// Des de «Totes les publicacions» (amb filtre opcional), obre «Edita» d'una publicació d'un altre autor en l'estat donat,
// la modifica amb HTML maliciós i comprova: editable, autor_id intacte, estat intacte i contingut net (Segur.neteja).
async function editaAliena(pg, qui, titol, estatInicial, filtre) {
  const p = BD.publicacions.find((x) => x.titol.startsWith(titol));
  p.estat = estatInicial;
  // Contingut desat amb codi maliciós: en obrir-lo, l'editor l'ha de passar per Segur.neteja.
  p.contingut = '<p>Original</p><img src=x onerror="window.__xss=5"><script>window.__xss=6</script>';
  const autor = BD.profiles.find((u) => u.id === p.autor_id);
  await pg.goto(ORIGEN + '/area-privada/panel.html#/totes' + (filtre ? '/' + filtre : '')); await pg.waitForSelector('#vista table');
  const fila = pg.locator('#vista tbody tr', { has: pg.locator('td:first-child', { hasText: p.titol }) });
  comprova(`${qui}: Totes${filtre ? '/' + filtre : ''} mostra l’autor «${autor.nom}» (nom, no correu) de «${titol}»`,
    (await fila.locator('td').nth(4).textContent()) === autor.nom && !(await fila.textContent()).includes('@'));
  const edita = fila.locator('a.btn:text-is("Edita")');
  comprova(`${qui}: botó «Edita» a la fila de «${titol}»`, (await edita.count()) === 1 && (await edita.getAttribute('href')) === '#/editar/' + p.id);
  peticions = [];
  await edita.click(); await pg.waitForSelector('#f-titol');
  comprova(`${qui}: l’editor s’obre editable en estat ${estatInicial}`, !(await pg.$eval('#f-titol', (i) => i.disabled))
    && (await pg.getAttribute('#f-contingut', 'contenteditable')) === 'true' && !/no la pots modificar/.test(await pg.textContent('#vista'))
    && (await textos(pg, '#vista .accions button')).includes('Desa'));
  comprova(`${qui}: el contingut desat arriba net a l’editor`, !/<img|<script|onerror/i.test(await pg.$eval('#f-contingut', (e) => e.innerHTML)));
  await pg.fill('#f-titol', titol + ' (editat per ' + qui + ')');
  // Marques que el navegador no executa per si soles; en desar, Segur.serialitza/neteja les ha de treure.
  await pg.$eval('#f-contingut', (e) => { e.innerHTML += '<p>Text revisat</p><script>window.__xss=1</script><a href="javascript:window.__xss=3">x</a><p style="color:red" onclick="window.__xss=4">estil</p><iframe srcdoc="x"></iframe>'; });
  await pg.click('#vista button:text-is("Desa")');
  await pg.waitForFunction(() => /Desat|Publicada|Enviada|Arxivada/.test(document.getElementById('avisos').textContent));
  const pat = peticions.filter((x) => x.m === 'PATCH' && x.url.startsWith('/rest/v1/publicacions')).pop();
  const cos = pat ? JSON.parse(pat.cos) : {};
  comprova(`${qui}: en desar «${titol}» no s’envia autor_id i l’autor continua sent ${autor.nom}`, !!pat && !('autor_id' in cos) && BD.publicacions.find((x) => x.id === p.id).autor_id === autor.id, pat && pat.cos);
  comprova(`${qui}: l’estat es manté (${estatInicial})`, cos.estat === estatInicial && BD.publicacions.find((x) => x.id === p.id).estat === estatInicial);
  comprova(`${qui}: el contingut editat es desa net (Segur.neteja)`, /Text revisat/.test(cos.contingut || '') && !/script|onerror|javascript:|style=|onclick|<img|<iframe/i.test(cos.contingut || ''), cos.contingut);
  comprova(`${qui}: no s’executa cap codi injectat`, (await pg.evaluate(() => window.__xss)) === undefined);
  if (estatInicial === 'publicat') {
    const pub = await pagina(MOBIL, true);
    await pub.goto(ORIGEN + '/noticia.html?id=' + p.id, { waitUntil: 'networkidle' });
    comprova(`${qui}: la publicada editada es veu actualitzada a la web pública`, (await pub.textContent('main h1')) === titol + ' (editat per ' + qui + ')'
      && /Text revisat/.test(await pub.textContent('.contingut')));
    await pub.context().close();
  }
  comprova(`${qui}: sense errors de consola en editar «${titol}»`, pg.errors.filter((e) => !/storage\/v1/.test(e)).length === 0, JSON.stringify(pg.errors));
}
// Col·laborador i consulta: no tenen «Totes» ni cap «Edita» de publicacions d'altres.
async function senseEditaAliena(pg, qui) {
  await pg.goto(ORIGEN + '/area-privada/panel.html#/totes'); await pg.waitForSelector('#vista h1');
  comprova(`${qui}: #/totes → «No tens accés a aquesta secció.» i cap botó «Edita»`, (await pg.textContent('#vista h1')) === 'No tens accés a aquesta secció.'
    && !(await pg.$('#vista table')));
  const aliena = BD.publicacions.find((x) => x.autor_id === U.E);
  await pg.goto(ORIGEN + '/area-privada/panel.html#/editar/' + aliena.id); await pg.waitForSelector('#vista h1');
  await pg.waitForFunction(() => !document.getElementById('vista').textContent.includes('Carregant'));
  comprova(`${qui}: #/editar/<id d’un altre> no obre l’editor`, !(await pg.$('#f-titol')) && /No hem trobat|No tens accés/.test(await pg.textContent('#vista h1')));
  const altres = BD.publicacions.filter((x) => x.autor_id !== U.C).map((x) => '#/editar/' + x.id);
  for (const r of ['inici', 'meves']) {
    await pg.goto(ORIGEN + '/area-privada/panel.html#/' + r); await pg.waitForSelector('#vista h1');
    const hrefs = await pg.$$eval('#vista a', (l) => l.map((a) => a.getAttribute('href')));
    comprova(`${qui}: #/${r} sense «Edita» de publicacions d’altres`, !hrefs.some((h) => altres.includes(h)));
  }
}

async function entra(vp, email, pw = PW) {
  const pg = await pagina(vp, true);
  await pg.goto(ORIGEN + '/area-privada/', { waitUntil: 'networkidle' });
  await pg.fill('#email', email); await pg.fill('#contrasenya', pw);
  await pg.click('#f-login button[type=submit]');
  return pg;
}
async function menu(pg) { await pg.waitForSelector('#menu a', { state: 'attached' }); return textos(pg, '#menu a'); }

console.log('\n7. Inici de sessió');
{
  const pg = await entra(ESCRIPTORI, 'col@ex.cat', 'dolenta');
  await pg.waitForFunction(() => document.getElementById('msg').textContent.includes('incorrectes'));
  comprova('contrasenya incorrecta → «Correu o contrasenya incorrectes.»', (await pg.textContent('#msg')) === 'Correu o contrasenya incorrectes.' && pg.url().endsWith('/area-privada/'));
  await pg.click('#obre-rec'); await pg.fill('#email-rec', 'qualsevol@ex.cat'); await pg.click('#f-recupera button[type=submit]');
  await pg.waitForFunction(() => document.getElementById('msg-rec').textContent.length > 0);
  comprova('recuperació: missatge genèric', (await pg.textContent('#msg-rec')) === 'Si el correu existeix, rebràs un enllaç per restablir la contrasenya.');
  const rec = peticions.find((x) => x.url.startsWith('/auth/v1/recover'));
  comprova('recuperació: redirectTo a /area-privada/contrasenya.html', !!rec && decodeURIComponent(rec.url).includes(ORIGEN + '/area-privada/contrasenya.html'));
  await pg.context().close();
}
{
  const pg = await entra(ESCRIPTORI, 'desactivat@ex.cat');
  await pg.waitForFunction(() => document.getElementById('msg').textContent.includes('desactivat'));
  comprova('compte desactivat → «Aquest compte està desactivat.» i sense sessió', (await pg.textContent('#msg')) === 'Aquest compte està desactivat.'
    && pg.url().endsWith('/area-privada/') && (await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('auth-token')).length)) === 0);
  await pg.goto(ORIGEN + '/area-privada/?m=desactivat');
  comprova('?m=desactivat mostra l’avís', (await pg.textContent('#msg')) === 'Aquest compte està desactivat.');
  await pg.context().close();
}

for (const [vp, nom, tactil] of [[ESCRIPTORI, '1280 px', false], [MOBIL, '390 px', true]]) {
  const pg = await pagina(vp, true, tactil ? { hasTouch: true, isMobile: true } : null);
  await pg.goto(ORIGEN + '/area-privada/', { waitUntil: 'networkidle' });
  await provaUll(pg, 'contrasenya', 'Ull inici de sessió (' + nom + ')', tactil);
  comprova('Ull inici de sessió (' + nom + '): sense desbordament', (await desbordament(pg)) <= 0);
  await pg.fill('#email', 'col@ex.cat'); await pg.fill('#contrasenya', 'dolenta');
  await pg.click('button[aria-controls="contrasenya"]');
  await pg.click('#f-login button[type=submit]');
  await pg.waitForFunction(() => document.getElementById('msg').textContent.includes('incorrectes'));
  comprova('Ull inici de sessió (' + nom + '): en enviar torna a password', (await pg.$eval('#contrasenya', (i) => i.type)) === 'password'
    && (await pg.getAttribute('button[aria-controls="contrasenya"]', 'aria-pressed')) === 'false');
  comprova('Ull inici de sessió (' + nom + '): sense errors de consola (a part del 400 esperat de l’accés fallit)', pg.errors.filter((e) => !/status of 400/.test(e)).length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}

console.log('\n8. Menú i botons segons el rol');
const ESPERAT = {
  'col@ex.cat': ['Inici', 'Nova publicació', 'Les meves publicacions', 'Documents'],
  'editor@ex.cat': ['Inici', 'Nova publicació', 'Les meves publicacions', 'Revisió', 'Totes les publicacions', 'Entitats', 'Eines', 'Documents'],
  'admin@ex.cat': ['Inici', 'Nova publicació', 'Les meves publicacions', 'Revisió', 'Totes les publicacions', 'Entitats', 'Eines', 'Documents', 'Usuaris'],
  'consulta@ex.cat': ['Inici', 'Documents']
};
const ROL = { 'col@ex.cat': 'Col·laborador de notícies', 'editor@ex.cat': 'Editor', 'admin@ex.cat': 'Administrador', 'consulta@ex.cat': 'Usuari de consulta' };
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const email of Object.keys(ESPERAT)) {
    BD = dadesInicials();
    const pg = await entra(vp, email);
    await pg.waitForURL('**/area-privada/panel.html*');
    const m = await menu(pg);
    comprova(`${email} @${vp.width}px: menú ${m.join(', ')}`, JSON.stringify(m) === JSON.stringify(ESPERAT[email]));
    if (vp === ESCRIPTORI) comprova(`${email}: rol a la capçalera`, (await pg.textContent('#u-rol')) === ROL[email]);
    await pg.waitForSelector('#vista h1');
    comprova(`${email} @${vp.width}px: sense errors ni desbordament a Inici`, pg.errors.length === 0 && (await desbordament(pg)) <= 0, JSON.stringify(pg.errors));
    if (vp === MOBIL) {
      comprova(`${email} mòbil: el menú és desplegable`, !(await pg.isVisible('#menu-privat')) && (await pg.isVisible('#mbp')));
      await pg.click('#mbp');
      comprova(`${email} mòbil: el botó obre el menú`, await pg.isVisible('#menu-privat'));
      await pg.click('#mbp');
    }
    const escriu = email !== 'consulta@ex.cat';
    if (escriu) {
      await pg.goto(ORIGEN + '/area-privada/panel.html#/nova'); await pg.waitForSelector('#f-titol');
      const b = await textos(pg, '#vista .accions button');
      const editora = email !== 'col@ex.cat';
      comprova(`${email} @${vp.width}px: botons del formulari ${b.join(', ')}`,
        b.includes('Desa') && b.includes('Previsualitza') && b.includes('Envia a revisió') && b.includes('Publica') === editora);
      comprova(`${email} @${vp.width}px: formulari sense desbordament`, (await desbordament(pg)) <= 0);
    }
    // Les rutes no permeses mostren un avís (i, de totes maneres, la base de dades no hi donaria accés).
    if (email !== 'admin@ex.cat') {
      await pg.goto(ORIGEN + '/area-privada/panel.html#/usuaris'); await pg.waitForSelector('#vista h1');
      comprova(`${email}: #/usuaris → «No tens accés a aquesta secció.»`, (await pg.textContent('#vista h1')) === 'No tens accés a aquesta secció.');
    } else {
      await pg.goto(ORIGEN + '/area-privada/panel.html#/usuaris'); await pg.waitForSelector('#vista table');
      comprova('admin @' + vp.width + 'px: taula d’usuaris (sense desbordament de pàgina)', (await desbordament(pg)) <= 0 && (await pg.$$('#vista tbody tr')).length === 5);
      comprova('admin: no pot canviar el seu propi rol ni desactivar-se', await pg.$eval('#vista tbody tr:first-child', (tr) => tr.querySelector('select').disabled && tr.querySelector('button').disabled));
      comprova('admin: formulari «Convida un usuari»', (await textos(pg, '#vista h2')).includes('Convida un usuari'));
      comprova('admin: cap contrasenya a la pàgina', !/password|contrasenya:/i.test(await pg.$eval('#vista table', (t) => t.textContent)));
    }
    await pg.context().close();
  }
}

console.log('\n9. Fluxos del col·laborador i de l’editor');
{
  BD = dadesInicials(); peticions = [];
  const pg = await entra(ESCRIPTORI, 'col@ex.cat');
  await pg.waitForURL('**/panel.html*'); await pg.waitForSelector('#vista h1');
  comprova('Inici mostra la nota de revisió de la retornada', (await pg.textContent('#vista')).includes('Falta la font de les dades.'));
  comprova('botó destacat «Crea una nova notícia»', (await textos(pg, '#vista a.btn')).includes('Crea una nova notícia'));
  await pg.goto(ORIGEN + '/area-privada/panel.html#/nova'); await pg.waitForSelector('#f-titol');
  await pg.fill('#f-titol', 'Notícia nova de prova');
  await pg.fill('#f-resum', 'Un resum');
  await pg.click('#f-contingut'); await pg.keyboard.type('Primer paràgraf');
  await pg.click('text=Negreta'); await pg.keyboard.type(' en negreta');
  await pg.setInputFiles('#f-imatge', { name: 'portada.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  comprova('selector d’imatge en català amb el nom del fitxer', (await pg.textContent('#f-imatge-nom')) === 'Imatge nova: portada.png');
  await pg.setInputFiles('#f-imatge', { name: 'gran.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  comprova('rebutja formats no permesos', (await pg.textContent('#avisos')).includes('JPEG, PNG o WebP'));
  await pg.setInputFiles('#f-imatge', { name: 'portada.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  await pg.click('#vista button:text-is("Previsualitza")');
  comprova('previsualització amb el text', (await pg.textContent('.previsualitzacio')).includes('Primer paràgraf'));
  await pg.click('#vista button:text-is("Desa")');
  await pg.waitForURL(/#\/editar\//);
  const ins = peticions.find((x) => x.m === 'POST' && x.url.startsWith('/rest/v1/publicacions'));
  const cos = ins && JSON.parse(ins.cos);
  comprova('«Desa» crea un esborrany a nom propi', cos && cos.estat === 'esborrany' && cos.autor_id === U.C && cos.titol === 'Notícia nova de prova');
  const pujada = peticions.find((x) => x.m === 'POST' && x.url.startsWith('/storage/v1/object/portades/'));
  const cami = pujada ? pujada.url.slice('/storage/v1/object/portades/'.length) : '';
  comprova('la portada es puja a portades/<uid>/<uuid>.png', new RegExp('^' + U.C + '/[0-9a-f-]{36}\\.png$').test(cami), cami);
  comprova('la publicació guarda la ruta de la imatge', cos && cos.imatge === cami);
  comprova('el contingut es desa net, amb negreta', cos && /<strong>/.test(cos.contingut) && !/<b>|style=/.test(cos.contingut));
  await pg.waitForSelector('#vista button:text-is("Envia a revisió")');
  await pg.click('#vista button:text-is("Envia a revisió")');
  await pg.waitForFunction(() => document.getElementById('avisos').textContent.includes('revisió'));
  const pat = peticions.filter((x) => x.m === 'PATCH').pop();
  comprova('«Envia a revisió» posa l’estat pendent', pat && JSON.parse(pat.cos).estat === 'pendent' && !('nota_revisio' in JSON.parse(pat.cos)));
  await pg.waitForSelector('#vista .msg');
  comprova('un cop pendent queda en només lectura', (await pg.textContent('#vista .msg')).includes('no la pots modificar') && !(await textos(pg, '#vista .accions button')).includes('Desa'));
  comprova('editor de text desactivat en només lectura', (await pg.getAttribute('#f-contingut', 'contenteditable')) === 'false');
  comprova('sense errors de consola (col·laborador)', pg.errors.length === 0, JSON.stringify(pg.errors));
  await senseEditaAliena(pg, 'col·laborador');
  fallaLogout = true;
  await pg.click('#sortir');
  await pg.waitForSelector('#avisos [role=alert]');
  comprova('si signOut falla: avís amb role="alert" i es queda al tauler amb la sessió', pg.url().includes('/area-privada/panel.html')
    && (await pg.textContent('#avisos [role=alert]')).includes('No s’ha pogut tancar la sessió') && (await tokens(pg)) > 0 && !(await pg.$eval('#sortir', (b) => b.disabled)));
  await pg.reload(); await pg.waitForSelector('#usuari:not([hidden])');
  comprova('si signOut falla: la sessió continua vàlida (recarregar manté el tauler)', pg.url().includes('/area-privada/panel.html'));
  fallaLogout = false; peticions = [];
  await pg.click('#sortir'); await pg.waitForURL(ORIGEN + '/');
  comprova('«Tanca la sessió» porta a la web pública (/) i esborra el token', new URL(pg.url()).pathname === '/' && (await tokens(pg)) === 0);
  comprova('«Tanca la sessió» crida /auth/v1/logout', peticions.some((x) => x.url.startsWith('/auth/v1/logout')));
  await pg.goBack().catch(() => {});
  await pg.waitForFunction(() => location.pathname !== '/area-privada/panel.html').catch(() => {}); await pg.waitForLoadState();
  comprova('el botó «enrere» no torna a mostrar el tauler', !pg.url().includes('panel.html') && !(await pg.$('#usuari:not([hidden])')), pg.url());
  await pg.goto(ORIGEN + '/area-privada/panel.html').catch(() => {}); await pg.waitForFunction(() => location.pathname === '/area-privada/').catch(() => {}); await pg.waitForLoadState();
  comprova('sense sessió, el tauler redirigeix a l’inici de sessió', pg.url().endsWith('/area-privada/'));
  await pg.context().close();
}
{
  peticions = [];
  const pg = await entra(MOBIL, 'editor@ex.cat');
  await pg.waitForURL('**/panel.html*');
  await pg.goto(ORIGEN + '/area-privada/panel.html#/revisio'); await pg.waitForSelector('#vista .item');
  comprova('Revisió mostra el nom de l’autor', (await pg.textContent('#vista .item')).includes('Carles Col'));
  await pg.click('#vista .item button:text-is("Retorna")');
  await pg.click('#vista .item button:text-is("Confirma el retorn")');
  await pg.waitForFunction(() => document.getElementById('avisos').textContent.length > 0);
  comprova('Retorna sense nota → error', (await pg.textContent('#avisos')).includes('Escriu una nota') && !peticions.some((x) => x.m === 'PATCH'));
  await pg.fill('#vista .item textarea', 'Cal revisar el títol.');
  await pg.click('#vista .item button:text-is("Confirma el retorn")');
  await pg.waitForFunction(() => document.getElementById('avisos').textContent.includes('Retornada'));
  const pat = peticions.filter((x) => x.m === 'PATCH').pop();
  comprova('Retorna amb nota → estat retornat + nota_revisio', pat && JSON.parse(pat.cos).estat === 'retornat' && JSON.parse(pat.cos).nota_revisio === 'Cal revisar el títol.');
  await pg.goto(ORIGEN + '/area-privada/panel.html#/totes'); await pg.waitForSelector('#vista table');
  comprova('Totes: l’editor no veu «Elimina»', !(await textos(pg, '#vista table button')).includes('Elimina'));
  comprova('Totes: sense desbordament de pàgina en mòbil', (await desbordament(pg)) <= 0);
  comprova('Totes: l’editor veu «Edita» a cada fila', await pg.$$eval('#vista tbody tr', (l) => l.every((tr) => tr.querySelector('a.btn')?.textContent === 'Edita')));
  comprova('Totes (390 px): «Edita» visible sense desplaçar la taula', await editaVisible(pg));
  if (CAPTURES) await pg.screenshot({ path: CAPTURES + '/totes-editor-390.png', fullPage: true });
  await editaAliena(pg, 'editor', 'Pendent del Carles', 'pendent');
  await editaAliena(pg, 'editor', 'Retornada del Carles', 'retornat', 'retornat');
  comprova('sense errors de consola (editor)', pg.errors.length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
{
  const pg = await entra(ESCRIPTORI, 'admin@ex.cat');
  await pg.waitForURL('**/panel.html*');
  await pg.goto(ORIGEN + '/area-privada/panel.html#/totes'); await pg.waitForSelector('#vista table');
  comprova('Totes: l’admin sí veu «Elimina»', (await textos(pg, '#vista table button')).includes('Elimina'));
  comprova('Totes: l’admin veu «Edita» i «Elimina» a cada fila', await pg.$$eval('#vista tbody tr', (l) => l.every((tr) =>
    tr.querySelector('a.btn')?.textContent === 'Edita' && tr.querySelector('button')?.textContent === 'Elimina')));
  comprova('Totes: escriptori sense desbordament', (await desbordament(pg)) <= 0);
  comprova('Totes (1280 px): «Edita» visible sense desplaçar la taula', await editaVisible(pg));
  if (CAPTURES) await pg.screenshot({ path: CAPTURES + '/totes-admin-1280.png', fullPage: true });
  await editaAliena(pg, 'admin', 'Comunicat publicat', 'publicat');
  await editaAliena(pg, 'admin', 'Esborrany del Carles', 'arxivat', 'arxivat');
  await editaAliena(pg, 'admin', 'Notícia nova de prova', 'esborrany', 'esborrany');
  await pg.goto(ORIGEN + '/area-privada/panel.html#/documents'); await pg.waitForSelector('#vista .item');
  comprova('Documents: l’admin gestiona accessos', !!(await pg.$('#vista details.doc-accessos')) && (await textos(pg, '#vista h2')).includes('Afegeix un document'));
  const a = await pg.$('#vista .item a[target=_blank]');
  comprova('Documents: enllaç https en pestanya nova amb rel noopener', (await a.getAttribute('rel')) === 'noopener noreferrer' && (await a.getAttribute('href')).startsWith('https://'));
  await pg.context().close();
}
{
  const pg = await entra(ESCRIPTORI, 'consulta@ex.cat');
  await pg.waitForURL('**/panel.html*');
  await pg.goto(ORIGEN + '/area-privada/panel.html#/documents'); await pg.waitForSelector('#vista h1');
  await pg.waitForFunction(() => !document.getElementById('vista').textContent.includes('Carregant'));
  comprova('consulta sense permisos: «No tens cap document disponible.»', (await pg.textContent('#vista')).includes('No tens cap document disponible.'));
  comprova('consulta no veu el formulari de documents', !(await textos(pg, '#vista h2')).includes('Afegeix un document'));
  await senseEditaAliena(pg, 'consulta');
  await pg.context().close();
}

console.log('\n10. Pàgina de contrasenya (invitació / recuperació)');
{
  const pg = await pagina(MOBIL, true);
  const u = BD.profiles.find((p) => p.email === 'col@ex.cat');
  const s = sessio(u);
  await pg.goto(ORIGEN + '/area-privada/contrasenya.html#access_token=' + s.access_token + '&refresh_token=' + s.refresh_token + '&expires_in=3600&expires_at=' + s.expires_at + '&token_type=bearer&type=recovery');
  await pg.waitForSelector('#f-pw:not([hidden])', { timeout: 8000 });
  comprova('amb l’enllaç vàlid apareix el formulari i s’esborra el token de l’URL', !pg.url().includes('access_token'));
  await provaUll(pg, 'pw1', 'Ull contrasenya nova');
  await provaUll(pg, 'pw2', 'Ull repetició');
  comprova('Ull contrasenya: sense desbordament (390 px)', (await desbordament(pg)) <= 0);
  await pg.fill('#pw1', 'curta'); await pg.fill('#pw2', 'curta');
  await pg.click('button[aria-controls="pw1"]'); await pg.click('button[aria-controls="pw2"]');
  await pg.click('#f-pw button[type=submit]');
  comprova('contrasenya curta → error', (await pg.textContent('#msg')).includes('mínim 10'));
  comprova('Ull contrasenya: en enviar els dos camps tornen a password', (await pg.$$eval('#f-pw input', (l) => l.map((i) => i.type))).join() === 'password,password');
  await pg.fill('#pw1', 'una-frase-prou-llarga'); await pg.fill('#pw2', 'una-altra-frase-llarga'); await pg.click('#f-pw button[type=submit]');
  comprova('no coincideixen → error', (await pg.textContent('#msg')).includes('no coincideixen'));
  await pg.fill('#pw2', 'una-frase-prou-llarga'); await pg.click('#f-pw button[type=submit]');
  await pg.waitForURL('**/area-privada/panel.html*');
  comprova('contrasenya desada → tauler', pg.url().includes('/area-privada/panel.html') && peticions.some((x) => x.m === 'PUT' && x.url === '/auth/v1/user'));
  await pg.context().close();
  const pg2 = await pagina(MOBIL, true);
  await pg2.goto(ORIGEN + '/area-privada/contrasenya.html#error=access_denied&error_code=otp_expired');
  await pg2.waitForFunction(() => document.getElementById('msg').textContent.includes('caducat'));
  comprova('enllaç caducat → «L\'enllaç ha caducat o no és vàlid.»', (await pg2.textContent('#msg')) === 'L\'enllaç ha caducat o no és vàlid.' && await pg2.$eval('#f-pw', (f) => f.hidden));
  await pg2.context().close();
}

console.log('\n11. Navegador en mode fosc: la web es manté clara (390 px i 1280 px)');
{
  // Contrast WCAG del text visible i dels botons sobre el fons real (ascendents amb color sòlid).
  const contrastos = (pg) => pg.evaluate(() => {
    const rgb = (c) => { const m = c.match(/[\d.]+/g) || []; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const fons = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') return null; const c = rgb(s.backgroundColor); if (c.a >= 0.99) return c; } return rgb('rgb(255,255,255)'); };
    const dolents = []; let revisats = 0;
    const sel = 'h1,h2,h3,h4,p,li,a,button,.btn,label,small,span,td,th,dt,dd,summary,figcaption';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (!r.width || !r.height || s.visibility === 'hidden' || +s.opacity === 0) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest('[hidden],[aria-hidden="true"],.sr-only,.visually-hidden')) continue;
      const bg = fons(el); if (!bg) continue;
      const fg = rgb(s.color); if (fg.a < 0.99) continue;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
      const mida = parseFloat(s.fontSize), gran = mida >= 24 || (mida >= 18.66 && +s.fontWeight >= 700);
      revisats++;
      if (ratio < (gran ? 3 : 4.5)) dolents.push(el.tagName + '.' + el.className + ' «' + el.textContent.trim().slice(0, 30) + '» ' + ratio.toFixed(2));
    }
    return { revisats, dolents };
  });
  const FOSC = { colorScheme: 'dark' };
  const nom = (ruta) => (ruta === '/' ? 'index' : ruta.replace(/^\/|\.html.*$|\/$/g, '').replace(/\//g, '-'));
  const rutes = PAGINES.map((r) => [r, false]).concat([['/app/', false], ['/area-privada/panel.html (amb sessió)', true]]);
  for (const vp of [MOBIL, ESCRIPTORI]) {
    for (const [ruta, ambSessio] of rutes) {
      const pg = await pagina(vp, ambSessio, FOSC);
      if (ambSessio) {
        await pg.goto(ORIGEN + '/area-privada/', { waitUntil: 'networkidle' });
        await pg.fill('#email', 'admin@ex.cat'); await pg.fill('#contrasenya', PW);
        await pg.click('#f-login button[type=submit]');
        await pg.waitForURL('**/area-privada/panel.html*'); await pg.waitForSelector('#menu a', { state: 'attached' });
        await pg.waitForLoadState('networkidle');
      } else {
        await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
      }
      const e = await pg.evaluate(() => ({ fosc: matchMedia('(prefers-color-scheme: dark)').matches,
        esquema: getComputedStyle(document.documentElement).colorScheme, fons: getComputedStyle(document.body).backgroundColor,
        meta: document.querySelector('meta[name="color-scheme"]')?.content, meta2: document.querySelector('meta[name="supported-color-schemes"]')?.content }));
      comprova(`${ruta} @${vp.width}px: amb el navegador fosc el fons segueix rgb(241, 240, 238)`,
        e.fosc && e.fons === 'rgb(241, 240, 238)' && e.esquema === 'light' && e.meta === 'light' && e.meta2 === 'light', JSON.stringify(e));
      const c = await contrastos(pg);
      comprova(`${ruta} @${vp.width}px: text i botons amb contrast AA (${c.revisats} elements)`, c.revisats > 0 && c.dolents.length === 0, c.dolents.slice(0, 5).join(' | '));
      if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/fosc-${nom(ruta.split(' ')[0])}${ambSessio ? '-sessio' : ''}-${vp.width}.png`, fullPage: true });
      await pg.context().close();
    }
  }
}

console.log('\n11b. Menú al mòbil (390 px)');
for (const ruta of ['/', '/noticia.html?id=no-valid', '/avis-legal.html', '/no-existeix']) {
  const pg = await pagina(MOBIL, false);
  await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
  const tancat = await pg.evaluate(() => ({ boto: !!document.getElementById('mb').offsetParent, nav: !!document.querySelector('#nav a').offsetParent }));
  await pg.click('#mb');
  const obert = await pg.evaluate(() => ({ exp: document.getElementById('mb').getAttribute('aria-expanded'),
    visibles: [...document.querySelectorAll('#nav > ul > li > a, #nav .desp-cap > :first-child')].filter((a) => a.offsetParent).map((a) => a.textContent).join(),
    subs: [...document.querySelectorAll('#nav .sub a')].filter((a) => a.offsetParent).length - document.querySelectorAll('#nav .desp.actiu .sub a').length,
    dins: [...document.querySelectorAll('#nav a, #nav button')].every((a) => a.getBoundingClientRect().right <= innerWidth) }));
  comprova(`${ruta}: el botó Menú obre Qui som, Actualitat, Projectes i Recursos, amb els submenús plegats i sense sortir per la dreta`, tancat.boto && !tancat.nav && obert.exp === 'true'
    && obert.visibles === 'Qui som,Actualitat,Projectes,Recursos' && obert.subs === 0 && obert.dins && (await desbordament(pg)) <= 0, JSON.stringify({ tancat, obert }));
  await pg.click('#nav [aria-controls=sub-recursos]');
  const acordio = await pg.evaluate(() => ({ subs: [...document.querySelectorAll('#nav .sub a')].filter((a) => a.offsetParent).map((a) => a.textContent).join(),
    exp: document.querySelector('#nav [aria-controls=sub-recursos]').getAttribute('aria-expanded') }));
  comprova(`${ruta}: «Recursos» s’obre com un acordió dins del menú`, acordio.subs === 'Informació,Entitats,Eines' && acordio.exp === 'true', JSON.stringify(acordio));
  await pg.click('#nav [aria-controls=sub-projectes]');
  comprova(`${ruta}: obrir «Projectes» plega «Recursos»`, (await pg.evaluate(() => [...document.querySelectorAll('#nav .sub a')].filter((a) => a.offsetParent).map((a) => a.textContent).join()))
    === 'Aerogeneradors de La Tallada,Aerogenerador d’Albons');
  await pg.keyboard.press('Escape');
  comprova(`${ruta}: Escape el tanca`, (await pg.getAttribute('#mb', 'aria-expanded')) === 'false');
  const pet = await pg.$eval('header .btn-peticio', (a) => { const r = a.getBoundingClientRect(); return { vis: !!a.offsetParent, dins: r.right <= innerWidth && r.left >= 0, h: r.height }; });
  comprova(`${ruta}: «Signa la petició» visible a la capçalera del mòbil, dins de la pantalla i ≥ 44 px`, pet.vis && pet.dins && pet.h >= 44, JSON.stringify(pet));
  if (ruta === '/') {
    await pg.click('#mb'); await pg.click('#nav [aria-controls=sub-projectes]');
    await Promise.all([pg.waitForURL('**/projecte-albons.html'), pg.click('#nav a[href="/projecte-albons.html"]')]);
    comprova('/: triar «Aerogenerador d’Albons» porta a la pàgina, amb el menú tancat i l’enllaç marcat', (await pg.getAttribute('#mb', 'aria-expanded')) === 'false'
      && (await pg.getAttribute('#nav a[href="/projecte-albons.html"]', 'aria-current')) === 'page');
    await pg.click('#mb');
    comprova('el submenú de la pàgina actual ja surt obert en obrir el menú', await pg.$eval('#sub-projectes', (u) => !!u.offsetParent));
  }
  await pg.context().close();
}

console.log('\n12. Fitxers nous, icones i capçaleres de seguretat');
{
  for (const [ruta, tipus] of [['/css/afegits.css', 'text/css'], ['/css/pagines.css', 'text/css'], ['/js/marc.js', 'text/javascript'], ['/js/agenda.js', 'text/javascript'], ['/img/og-defensem.jpg', 'image/jpeg'],
    ['/img/logo-defensem-2x.webp', 'image/webp'], ['/img/logo-defensem-2x.png', 'image/png'], ['/favicon.ico', 'image/x-icon'], ['/img/icona-32.png', 'image/png'],
    ['/img/apple-touch-icon.png', 'image/png'], ['/img/icona-192.png', 'image/png'], ['/img/icona-512.png', 'image/png'], ['/site.webmanifest', 'application/manifest+json'],
    ['/docs/fulleto-moli-salancs-albons.pdf', 'application/pdf'], ['/fora-molins/assets/manifest.json', 'application/json'], ['/fora-molins/joc.js', 'text/javascript'],
    ['/fora-molins/joc.css', 'text/css'], ['/robots.txt', 'text/plain'], ['/sitemap.xml', 'application/xml']]) {
    const r = await fetch(ORIGEN + ruta), mida = (await r.arrayBuffer()).byteLength;
    comprova(`s’obre ${ruta}`, r.status === 200 && r.headers.get('content-type').startsWith(tipus) && mida > 0, r.status + ' ' + r.headers.get('content-type'));
  }
  const man = JSON.parse(await readFile(join(ARREL, 'site.webmanifest'), 'utf8'));
  comprova('site.webmanifest: nom, color i icones 192 i 512 que existeixen', !!man.name && man.icons.length >= 2 && man.icons.every((i) => i.src.startsWith('/img/icona-')), JSON.stringify(man.icons));
  const robots = await readFile(join(ARREL, 'robots.txt'), 'utf8'), sitemap = await readFile(join(ARREL, 'sitemap.xml'), 'utf8');
  comprova('robots.txt apunta al sitemap i no indexa l’àrea privada', /Sitemap: https:\/\/defensem\.vercel\.app\/sitemap\.xml/.test(robots) && /Disallow: \/area-privada/.test(robots), robots);
  comprova('sitemap.xml inclou la portada i totes les pàgines noves', ['', 'qui-som.html', 'actualitat.html', 'noticies-defensem.html', 'noticies-renovables.html',
    'projecte-la-tallada.html', 'projecte-albons.html', 'documents.html', 'entitats.html', 'eines.html']
    .every((p) => sitemap.includes(`<loc>https://defensem.vercel.app/${p}</loc>`)));

  const ICONES = ['link[rel=icon][href="/favicon.ico"][sizes="48x48"]', 'link[rel=icon][href="/img/icona-32.png"][type="image/png"][sizes="32x32"]',
    'link[rel=apple-touch-icon][href="/img/apple-touch-icon.png"]', 'link[rel=manifest][href="/site.webmanifest"]', 'meta[name=theme-color][content="#298d3b"]'];
  for (const ruta of [...PAGINES, '/404.html']) {
    const pg = await pagina(MOBIL, false);
    await pg.goto(ORIGEN + ruta);
    const falten = await pg.evaluate((l) => l.filter((s) => !document.head.querySelector(s)), ICONES);
    comprova(`${ruta}: les cinc línies d’icones a <head>`, falten.length === 0, falten.join(' '));
    if (!ruta.startsWith('/area-privada')) {
      const og = await pg.evaluate(() => [document.querySelector('meta[property="og:image"]')?.content, document.querySelector('meta[name="twitter:card"]')?.content].join());
      comprova(`${ruta}: imatge per compartir (og:image i twitter:card)`, og === `https://defensem.vercel.app/img/og-${ruta === '/joc.html' ? 'joc' : 'defensem'}.jpg,summary_large_image`, og);
    }
    await pg.context().close();
  }
  {
    const pg = await pagina(MOBIL, false);
    await pg.goto(ORIGEN + '/');
    const m = await pg.evaluate(() => ({ canon: document.querySelector('link[rel=canonical]')?.href, url: document.querySelector('meta[property="og:url"]')?.content,
      w: document.querySelector('meta[property="og:image:width"]')?.content, h: document.querySelector('meta[property="og:image:height"]')?.content,
      alt: document.querySelector('meta[property="og:image:alt"]')?.content, color: document.querySelector('meta[name="color-scheme"]')?.content }));
    comprova('portada: canonical, og:url, mida i text alternatiu de la imatge per compartir', m.canon === 'https://defensem.vercel.app/' && m.url === m.canon && m.w === '1200' && m.h === '630' && !!m.alt, JSON.stringify(m));
    const og = await pg.evaluate(() => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight].join('x')); i.onerror = () => ok('error'); i.src = '/img/og-defensem.jpg'; }));
    comprova('la imatge per compartir fa 1200 × 630', og === '1200x630', og);
    comprova('la portada continua forçant l’esquema clar', m.color === 'light');
    await pg.context().close();
  }
  for (const f of ['avis-legal.html', 'privacitat.html']) {
    const h = await readFile(join(ARREL, f), 'utf8');
    comprova(`${f}: es mantenen les dades pendents (mark.falta) i l’avís de dalt`, (h.match(/<mark class="falta">\[[^\]]+\]<\/mark>/g) || []).length > 0 && /<p class="avis">/.test(h));
  }

  const r = await fetch(ORIGEN + '/'), cap = (k) => r.headers.get(k);
  comprova('es mantenen nosniff, Referrer-Policy i X-Frame-Options', cap('x-content-type-options') === 'nosniff' && cap('referrer-policy') === 'strict-origin-when-cross-origin' && cap('x-frame-options') === 'DENY');
  comprova('Permissions-Policy activa (sense càmera, micròfon ni ubicació)', /camera=\(\)/.test(cap('permissions-policy')) && /geolocation=\(\)/.test(cap('permissions-policy')));
  comprova('CSP en mode de prova (Report-Only), encara no aplicada', /default-src 'self'/.test(cap('content-security-policy-report-only')) && !cap('content-security-policy'));
  const rp = await fetch(ORIGEN + '/area-privada/panel.html');
  comprova('l’àrea privada continua amb Cache-Control: no-store', rp.headers.get('cache-control') === 'no-store');
  const real = (await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  comprova('a vercel.json la CSP apunta al Supabase del projecte', real.includes('connect-src \'self\' https://uzkwfudbrozjzjtcjfry.supabase.co wss://uzkwfudbrozjzjtcjfry.supabase.co')
    && (await readFile(join(ARREL, 'js/config.js'), 'utf8')).includes('https://uzkwfudbrozjzjtcjfry.supabase.co'));
}

console.log('\n12b. Drecera /equip cap a l’accés de l’àrea privada');
{
  for (const ruta of ['/equip', '/equip/']) {
    const r = await fetch(ORIGEN + ruta, { redirect: 'manual' });
    comprova(`${ruta}: redirecció temporal (302) a /area-privada/`, r.status === 302 && r.headers.get('location') === '/area-privada/', r.status + ' ' + r.headers.get('location'));
    const pg = await pagina(MOBIL, false);
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    comprova(`${ruta}: al navegador acaba a la pantalla d’accés de l’àrea privada`, new URL(pg.url()).pathname === '/area-privada/' && !!(await pg.$('#f-login #email')), pg.url());
    await pg.context().close();
  }
  const red = VERCEL.redirects.filter((r) => r.source.startsWith('/equip'));
  comprova('vercel.json: les dues redireccions /equip són temporals (302, no permanents)', red.length === 2 && red.every((r) => r.statusCode === 302 && r.permanent === undefined && r.destination === '/area-privada/'));
  comprova('/equip no surt al sitemap.xml', !(await readFile(join(ARREL, 'sitemap.xml'), 'utf8')).includes('equip'));
  const robots = await readFile(join(ARREL, 'robots.txt'), 'utf8');
  comprova('robots.txt manté «Disallow: /area-privada» i no esmenta /equip', /^Disallow: \/area-privada\/?$/m.test(robots) && !robots.includes('equip'), robots);
  // Cap enllaç ni menció de /equip a cap fitxer de text de la web (HTML, JS, CSS, JSON, XML, TXT).
  const { readdir } = await import('node:fs/promises');
  const fitxers = (await readdir(ARREL, { recursive: true })).filter((f) => /\.(html|js|css|json|xml|txt|webmanifest)$/.test(f));
  const amb = [];
  for (const f of fitxers) if (/\/equip\b/.test(await readFile(join(ARREL, f), 'utf8'))) amb.push(f);
  comprova(`cap dels ${fitxers.length} fitxers de la web enllaça /equip`, fitxers.length > 20 && amb.length === 0, amb.join());
}

console.log('\n13. Pàgina 404');
for (const vp of [MOBIL, ESCRIPTORI]) {
  const pg = await pagina(vp, false);
  const resp = await pg.goto(ORIGEN + '/no-existeix', { waitUntil: 'networkidle' });
  const p = await pg.evaluate(() => ({ titol: document.title, robots: document.querySelector('meta[name=robots]')?.content, h1: document.querySelector('main h1')?.textContent,
    inici: !!document.querySelector('main a[href="/"]'), peu: !!document.querySelector('footer .peu-legal') }));
  comprova(`/no-existeix @${vp.width}px: estat 404 i la pàgina pròpia`, resp.status() === 404 && p.titol === 'Pàgina no trobada · Defensem l’Empordanet' && !!p.h1 && p.inici && p.peu, JSON.stringify(p));
  comprova(`/no-existeix @${vp.width}px: noindex`, p.robots === 'noindex');
  const errors = pg.errors.filter((e) => !/404/.test(e) && !/no-existeix/.test(e));
  comprova(`/no-existeix @${vp.width}px: sense més errors, recursos externs ni desbordament`, errors.length === 0 && pg.externes.length === 0 && (await desbordament(pg)) <= 0, JSON.stringify(errors));
  const sub = await pg.goto(ORIGEN + '/carpeta/que/no/hi/es.html', { waitUntil: 'networkidle' });
  comprova(`404 també en una subcarpeta, amb estils (camins absoluts) @${vp.width}px`, sub.status() === 404 && (await pg.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(241, 240, 238)');
  await pg.context().close();
}

console.log('\n14. Agenda: actes propers a dalt, passats a «Actes anteriors»');
for (const [avui, propers, passats] of [['2026-10-22', ['2026-10-24'], ['2026-07-23', '2026-03-07']], ['2026-10-24', ['2026-10-24'], ['2026-07-23', '2026-03-07']],
  ['2026-10-25', [], ['2026-10-24', '2026-07-23', '2026-03-07']], ['2026-01-15', ['2026-03-07', '2026-07-23', '2026-10-24'], []]]) {
  const pg = await pagina(MOBIL, false);
  await pg.clock.setFixedTime(new Date(avui + 'T20:00:00'));
  await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
  const a = await pg.evaluate(() => ({ propers: [...document.querySelectorAll('#actes > li')].map((l) => l.dataset.fins), passats: [...document.querySelectorAll('#actes-fets > li')].map((l) => l.dataset.fins),
    llista: !document.getElementById('actes').hidden, anteriors: !document.getElementById('actes-anteriors').hidden, buit: !document.getElementById('agenda-buit').hidden,
    resum: document.querySelector('#actes-anteriors summary').textContent }));
  comprova(`${avui}: a dalt ${propers.join(', ') || 'cap'}; a anteriors ${passats.join(', ') || 'cap'}`, a.propers.join() === propers.join() && a.passats.join() === passats.join(), JSON.stringify(a));
  comprova(`${avui}: «Actes anteriors» ${passats.length ? 'visible' : 'amagat'}, avís de buit ${propers.length ? 'amagat' : 'visible'}`,
    a.anteriors === passats.length > 0 && a.buit === (propers.length === 0) && a.llista === propers.length > 0 && a.resum === 'Actes anteriors', JSON.stringify(a));
  if (avui === '2026-10-22') {
    await pg.click('#actes-anteriors summary');
    comprova(`${avui}: «Actes anteriors» s’obre i mostra els cartells`, await pg.$eval('#actes-anteriors', (d) => d.open && [...d.querySelectorAll('img')].length === 2));
    await pg.$eval('#agenda', (e) => e.scrollIntoView()); await pg.waitForTimeout(300);
    comprova(`${avui}: els cartells carreguen (lazy) i els enllaços porten al cartell gran`, await pg.$$eval('#agenda .acte', (l) => l.every((li) => {
      const i = li.querySelector('.acte-cartell img'), a = li.querySelector('a.acte-cartell'); return i.complete && i.naturalWidth > 0 && /^\/img\/agenda\/[a-z-]+\.webp$/.test(a.getAttribute('href'));
    })));
  }
  await pg.context().close();
}
{
  const pg = await pagina(MOBIL, false);
  await pg.route('**/js/agenda.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
  comprova('sense JavaScript, es veuen tots els actes en una sola llista', (await pg.$$('#actes > li')).length === 3 && await pg.$eval('#actes', (o) => !o.hidden));
  await pg.context().close();
}

console.log('\n15. Minijoc «Fora molins!» (390 px i 1280 px)');
// Espia de drawImage: apunta cada mà (ma0/1/2.webp) que es pinta a la tela, amb la posició en píxels de la tela.
const espiaMans = () => {
  window.__mans = [];
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (im, ...r) {
    if (im && im.src && /\/ma\d\.webp/.test(im.src) && this.canvas.classList.contains('fm-tela')) { const t = this.getTransform(); window.__mans.push({ x: t.e, y: t.f, t: performance.now() }); }
    return orig.call(this, im, ...r);
  };
};
// Posició a la pantalla d'un molí (inversa de aLogica a joc.js: H = 1200; la franja visible del paisatge, vista.x0–x1, la diu el joc).
const aPantalla = (pg, l) => pg.$eval('.fm-tela', (c, l) => { const r = c.getBoundingClientRect(), v = window.__foraMolins.vista();
  const x0 = v.x0, x1 = v.x1; return { x: r.left + (l.x - x0) / (x1 - x0) * r.width, y: r.top + (l.y - 40 * l.s) / 1200 * r.height, k: c.width / (x1 - x0), x0 }; }, l);
const espera = (pg, fn, arg, ms = 8000) => pg.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
for (const vp of [MOBIL, ESCRIPTORI]) {
  const nom = `@${vp.width}px`;
  const pg = await pagina(vp, false);
  await pg.addInitScript(espiaMans);
  const recursos = [];
  // Només el logo de la pantalla final (90 kB) es baixa d'entrada: joc.js li posa el src en arrencar.
  pg.on('request', (r) => { if (/\/fora-molins\/(assets|sons)\//.test(r.url()) && !/\/assets\/logo\.webp/.test(r.url())) recursos.push(r.url()); });
  await pg.goto(ORIGEN + '/joc?debug', { waitUntil: 'networkidle' });
  comprova(`joc ${nom}: és l’app de /joc`, await pg.evaluate(() => document.querySelector('main#joc[data-fora-molins][data-encaixa]') !== null));
  await pg.$eval('#joc', (e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const llest = await espera(pg, () => window.__foraMolins && window.__foraMolins.llest() && !document.querySelector('[data-juga]').disabled);
  comprova(`joc ${nom}: carrega el manifest i els gràfics i el botó diu «Juga»`, llest && (await pg.textContent('[data-juga]')) === 'Juga' && recursos.some((u) => u.includes('manifest.json')));
  comprova(`joc ${nom}: sense desbordament, sense errors ni recursos externs`, (await desbordament(pg)) <= 0 && pg.errors.length === 0 && pg.externes.length === 0, JSON.stringify({ e: pg.errors, x: pg.externes }));
  if (vp === MOBIL) comprova(`joc ${nom}: en mòbil la vista es retalla pels costats (fm-estret)`, await pg.$eval('.fm-escenari', (e) => e.classList.contains('fm-estret')));
  const vermella = await pg.evaluate(() => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let v = 0, n = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 200) { n++; if (d[k] > 170 && d[k + 1] < 90 && d[k + 2] < 90) v++; } ok({ vermells: v, opacs: n, proporcio: v / n }); }; i.src = '/fora-molins/assets/ma0.webp'; }));
  comprova(`joc ${nom}: la mà és vermella`, vermella.opacs > 0 && vermella.proporcio > 0.1, JSON.stringify(vermella));

  await pg.click('[data-juga]');
  comprova(`joc ${nom}: «Juga» amaga la portada del joc, mostra el marcador i fa el compte enrere`, await pg.evaluate(() => document.querySelector('[data-inici]').hidden
    && !document.querySelector('[data-hud]').hidden && window.__foraMolins.joc.fase === 'compte'));
  comprova(`joc ${nom}: després del compte enrere comença la partida`, await espera(pg, () => window.__foraMolins.joc.fase === 'joc', null, 5000));
  comprova(`joc ${nom}: brota un molí`, await espera(pg, () => window.__foraMolins.molins().some((l) => l.estat === 'avis' || l.estat === 'creix'), null, 5000));
  // Fins a 3 intents (el molí pot desaparèixer o canviar just abans del clic); si tots fallen, el detall diu què hi havia sota el dit.
  let l, p, cop; const intents = [];
  for (let i = 0; i < 3; i++) {
    await espera(pg, () => window.__foraMolins.joc.fase === 'joc' && window.__foraMolins.molins().some((l) => l.estat === 'avis' || l.estat === 'creix'), null, 5000);
    l = await pg.evaluate(() => { const l = window.__foraMolins.molins().find((m) => m.estat === 'avis' || m.estat === 'creix'); if (!l) return null; l.__prova = true; return { x: l.x, y: l.y, s: l.s }; });
    if (!l) { intents.push('sense molí'); continue; }
    // html té scroll-behavior: smooth; es recentra la tela a l'instant perquè el punt calculat sigui a la pantalla.
    await pg.$eval('.fm-tela', (c) => c.scrollIntoView({ block: 'center', behavior: 'instant' }));
    p = await aPantalla(pg, l);
    await pg.evaluate(() => { window.__mans = []; });
    await pg.mouse.click(p.x, p.y);
    cop = await pg.evaluate((p) => { const f = window.__foraMolins, m = f.molins().find((x) => x.__prova), e = document.elementFromPoint(p.x, p.y);
      f.molins().forEach((x) => { delete x.__prova; });
      return { estat: m && m.estat, aturats: f.joc.aturats, punts: f.joc.punts, marcador: document.querySelector('[data-punts]').textContent, fase: f.joc.fase, sota: e && e.className, p }; }, p);
    intents.push(cop);
    if (cop.estat === 'enfonsa') break;
  }
  comprova(`joc ${nom}: tocar el molí l’atura i suma punts${intents.length > 1 ? ' (' + intents.length + ' intents)' : ''}`,
    cop && cop.estat === 'enfonsa' && cop.aturats === 1 && cop.punts >= 1 && cop.marcador === String(cop.punts), JSON.stringify(intents));
  await espera(pg, () => window.__mans.length > 0, null, 2000);
  const mans = await pg.evaluate(() => window.__mans);
  const esperat = (l.x - p.x0) * p.k;
  comprova(`joc ${nom}: s’hi estampa una mà vermella, damunt del molí tocat`, mans.length > 0 && Math.abs(mans[0].x - esperat) < 40 * p.k, JSON.stringify({ mans: mans.slice(0, 2), esperat }));

  // Amb el teclat: l'espai atura el molí més crescut.
  const hiHa = await espera(pg, () => window.__foraMolins.joc.fase === 'joc' && window.__foraMolins.molins().some((l) => l.estat === 'avis' || l.estat === 'creix'), null, 5000);
  await pg.focus('.fm-tela'); await pg.keyboard.press('Space');
  const tec = await pg.evaluate(() => ({ aturats: window.__foraMolins.joc.aturats, fase: window.__foraMolins.joc.fase, focus: document.activeElement.className }));
  comprova(`joc ${nom}: amb el teclat (espai) també s’atura un molí`, hiHa && tec.aturats === 2, JSON.stringify(tec));

  // Final de partida: s'avança el rellotge del joc fins al darrer instant.
  await pg.evaluate(() => { window.__foraMolins.joc.temps = 39.95; });
  comprova(`joc ${nom}: en acabar el temps surt la pantalla final`, await espera(pg, () => !document.querySelector('[data-final]').hidden, null, 4000));
  const fi = await pg.evaluate(() => { const f = document.querySelector('[data-final]'), logo = f.querySelector('[data-logo]'), a = f.querySelector('a.fm-boto-signa'), r = logo.getBoundingClientRect();
    return { logo: logo.complete && logo.naturalWidth > 0 && /\/fora-molins\/assets\/logo\.webp/.test(logo.src) && r.width > 0, alt: logo.alt, text: a.textContent, href: a.href, target: a.target, rel: a.rel,
      label: a.getAttribute('aria-label'), punts: f.querySelector('[data-f-punts]').textContent, aturats: f.querySelector('[data-f-aturats]').textContent, focus: document.activeElement.textContent,
      rec: localStorage.getItem('defensem.foramolins.punts'), joc: String(window.__foraMolins.joc.punts), anunci: document.querySelector('[data-anunci]').textContent }; });
  comprova(`joc ${nom}: la pantalla final té el logo`, fi.logo && fi.alt === 'Defensem l’Empordanet · Aturem el Plater', JSON.stringify(fi));
  comprova(`joc ${nom}: i el botó «Signa la petició» al formulari, en pestanya nova`, fi.text === 'Signa la petició' && fi.target === '_blank' && /noopener/.test(fi.rel)
    && fi.href === 'https://docs.google.com/forms/d/e/1FAIpQLSf6IsYYaV5FMGA-Qw-Khk-ff-6PxW5JrYaxLETymXJ7eg7CJg/viewform' && fi.label.startsWith('Signa la petició'), JSON.stringify(fi));
  comprova(`joc ${nom}: punts, molins aturats, rècord desat i resum per a lectors de pantalla`, fi.punts === fi.joc && fi.aturats === '2' && fi.rec === fi.joc && fi.anunci.startsWith('Fi de la partida. Has fet ' + fi.joc), JSON.stringify(fi));
  comprova(`joc ${nom}: el focus va a «Torna a jugar»`, fi.focus === 'Torna a jugar', fi.focus);
  comprova(`joc ${nom}: pantalla final sense desbordament`, (await desbordament(pg)) <= 0);
  if (CAPTURES) await (await pg.$('.fm-escenari')).screenshot({ path: `${CAPTURES}/joc-final-${vp.width}.png` });
  await pg.click('[data-torna]');
  comprova(`joc ${nom}: «Torna a jugar» en comença una altra`, await pg.evaluate(() => document.querySelector('[data-final]').hidden && window.__foraMolins.joc.fase === 'compte' && window.__foraMolins.joc.punts === 0));

  const so0 = await pg.getAttribute('[data-so]', 'aria-pressed');
  await pg.click('[data-so]');
  const so = await pg.evaluate(() => ({ p: document.querySelector('[data-so]').getAttribute('aria-pressed'), l: document.querySelector('[data-so]').getAttribute('aria-label'), desat: localStorage.getItem('defensem.foramolins.so') }));
  comprova(`joc ${nom}: el botó de so silencia i ho recorda`, so0 === 'false' && so.p === 'true' && so.l === 'Activa el so' && so.desat === '0', JSON.stringify(so));
  const claus = await pg.evaluate(() => Object.keys(localStorage).sort().join());
  comprova(`joc ${nom}: al navegador només es desen les claus documentades a cookies.html`, claus === [CC_CLAU, 'defensem.foramolins.punts', 'defensem.foramolins.so'].sort().join(), claus);
  const cookiesHtml = await readFile(join(ARREL, 'cookies.html'), 'utf8');
  if (vp === MOBIL) comprova('cookies.html explica les dues claus del joc', cookiesHtml.includes('defensem.foramolins.punts') && cookiesHtml.includes('defensem.foramolins.so'));
  comprova(`joc ${nom}: cap error, cap cookie, cap recurs extern durant la partida`, pg.errors.length === 0 && pg.cspAtributs.length === 0 && pg.externes.length === 0 && (await pg.context().cookies()).length === 0, JSON.stringify({ e: pg.errors, x: pg.externes }));
  await pg.context().close();
}
{
  const pg = await pagina(ESCRIPTORI, false);
  await pg.goto(ORIGEN + '/joc', { waitUntil: 'networkidle' });
  comprova('joc: sense ?debug no s’exposa cap objecte de depuració', (await pg.evaluate(() => typeof window.__foraMolins)) === 'undefined');
  await pg.$eval('#joc', (e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  comprova('joc: també s’hi juga sense ?debug (el botó passa a «Juga» i arrenca)', await espera(pg, () => document.querySelector('[data-juga]').textContent === 'Juga')
    && (await pg.click('[data-juga]').then(() => true)) && await pg.$eval('[data-inici]', (e) => e.hidden));
  await pg.context().close();
}
{
  // Si no troba els gràfics, el botó ofereix tornar-ho a provar (la guia «Si alguna cosa falla»).
  const pg = await pagina(ESCRIPTORI, false);
  await pg.route('**/fora-molins/assets/manifest.json*', (r) => r.fulfill({ status: 500, body: 'x' }));
  await pg.goto(ORIGEN + '/joc', { waitUntil: 'networkidle' });
  await pg.$eval('#joc', (e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  comprova('joc: sense manifest, el botó diu «Torna-ho a provar»', await espera(pg, () => document.querySelector('[data-juga]').textContent === 'Torna-ho a provar'));
  await pg.context().close();
}

console.log('\n15c. /joc: el joc com a app independent (per obrir des d’Instagram)');
{
  const a = await fetch(ORIGEN + '/joc'), b = await fetch(ORIGEN + '/joc.html');
  comprova('/joc funciona sense .html (rewrite de vercel.json) i és la mateixa pàgina', a.status === 200 && (await a.text()) === (await b.text()));
  const html = await (await fetch(ORIGEN + '/joc')).text();
  const meta = (k, attr = 'property') => (html.match(new RegExp(`<meta ${attr}="${k}" content="([^"]+)"`)) || [])[1];
  comprova('/joc: Open Graph propi (títol, descripció, imatge 1200 × 630, URL) i targeta gran', /Fora molins!/.test(meta('og:title')) && !!meta('og:description')
    && meta('og:image') === 'https://defensem.vercel.app/img/og-joc.jpg' && meta('og:url') === 'https://defensem.vercel.app/joc' && meta('twitter:card', 'name') === 'summary_large_image');
  comprova('/joc: noindex i mode clar forçat', meta('robots', 'name') === 'noindex' && meta('color-scheme', 'name') === 'light');
  comprova('/joc: sense capçalera, menú, peu ni bàner de la web', !/marc\.js|menu\.js|consentiment\.js|<header|<footer|<nav/.test(html));
  for (const [img, w, h] of [['/img/instagram/joc-post.png', 1080, 1350], ['/img/instagram/joc-historia.png', 1080, 1920], ['/img/og-joc.jpg', 1200, 630]]) {
    const pg = await pagina(MOBIL, false); await pg.goto(ORIGEN + img);
    const mida = await pg.evaluate(() => { const i = document.querySelector('img'); return [i.naturalWidth, i.naturalHeight].join('x'); });
    comprova(`${img}: ${w}×${h}`, mida === w + 'x' + h, mida); await pg.context().close();
  }
}
for (const vp of [MOBIL, { width: 360, height: 640 }, ESCRIPTORI]) {
  const nom = `@${vp.width}×${vp.height}`;
  const pg = await pagina(vp, false);
  await pg.goto(ORIGEN + '/joc?debug', { waitUntil: 'networkidle' });
  const llest = await espera(pg, () => window.__foraMolins && window.__foraMolins.llest() && !document.querySelector('[data-juga]').disabled);
  const c = await pg.evaluate(() => { const e = document.querySelector('.fm-escenari').getBoundingClientRect(), l = document.querySelector('.fm-app-logo img').getBoundingClientRect();
    return { scroll: document.documentElement.scrollHeight - innerHeight, esc: [Math.round(e.top), Math.round(e.bottom), Math.round(e.width), Math.round(e.height)], alt: innerHeight, ample: innerWidth,
      logo: [Math.round(l.top), Math.round(l.height)], h1: document.querySelector('h1')?.textContent, fons: getComputedStyle(document.body).backgroundColor }; });
  comprova(`/joc ${nom}: pantalla completa sense desplaçament, logo petit a dalt`, llest && c.scroll <= 0 && c.esc[1] <= c.alt && c.logo[0] < 20 && c.logo[1] <= 72
    && c.fons === 'rgb(241, 240, 238)' && /Fora molins!/.test(c.h1), JSON.stringify(c));
  if (vp.width < 620) comprova(`/joc ${nom}: en vertical l’escenari omple l’amplada i gairebé tota l’alçada`, c.esc[2] >= c.ample - 20 && c.esc[3] >= c.alt * 0.8, JSON.stringify(c.esc));
  else comprova(`/joc ${nom}: en escriptori l’escenari hi cap sencer`, c.esc[3] >= c.alt * 0.8 && c.esc[1] <= c.alt, JSON.stringify(c.esc));
  await pg.click('[data-juga]');
  comprova(`/joc ${nom}: es juga i els molins brollen dins de la vista`, await espera(pg, () => window.__foraMolins.joc.fase === 'joc', null, 5000)
    && await pg.evaluate(() => { for (let i = 0; i < 6; i++) window.__foraMolins.brota(); const m = window.__foraMolins.molins(); return m.length > 0; }));
  await pg.evaluate(() => { window.__foraMolins.joc.temps = 39.95; });
  comprova(`/joc ${nom}: en acabar surt la pantalla final`, await espera(pg, () => !document.querySelector('[data-final]').hidden, null, 4000));
  const f = await pg.evaluate(() => ({ punts: document.querySelector('[data-f-punts]').textContent,
    botons: [...document.querySelectorAll('[data-final] .fm-botons > *')].filter((e) => !e.hidden).map((e) => e.textContent.trim()),
    signa: (() => { const a = document.querySelector('[data-final] a.fm-boto-signa'); return [a.target, a.rel, /docs\.google\.com\/forms/.test(a.href)].join('|'); })(),
    campanya: document.querySelector('[data-final] a.fm-boto-sec')?.getAttribute('href'), scroll: document.documentElement.scrollHeight - innerHeight }));
  comprova(`/joc ${nom}: pantalla final amb la puntuació, «Torna a jugar», «Signa la petició» i «Coneix la campanya»`, f.punts !== '' && f.botons.join() === 'Torna a jugar,Signa la petició,Coneix la campanya'
    && f.signa === '_blank|noopener noreferrer|true' && f.campanya === '/' && f.scroll <= 0, JSON.stringify(f));
  await pg.click('[data-torna]');
  comprova(`/joc ${nom}: «Torna a jugar» en comença una altra`, await pg.evaluate(() => document.querySelector('[data-final]').hidden && window.__foraMolins.joc.fase === 'compte'));
  comprova(`/joc ${nom}: cap error ni recurs extern`, pg.errors.length === 0 && pg.externes.length === 0, JSON.stringify({ e: pg.errors, x: pg.externes }));
  await pg.context().close();
}

console.log('\n16. Entitats i Eines');
{
  // Sense Supabase: estat buit, només el missatge (ni botó ni formulari d'adhesió).
  const pg = await pagina(MOBIL, false);
  await pg.goto(ORIGEN + '/entitats.html', { waitUntil: 'networkidle' });
  const e = await pg.evaluate(() => ({ text: document.querySelector('#ent-llista .prox-t')?.textContent,
    adhesio: [...document.querySelectorAll('button, a')].filter((b) => /adherir|adhesi/i.test(b.textContent)).length + document.querySelectorAll('#adhesio, form, .adh-obre').length,
    filtres: !document.getElementById('ent-filtres') }));
  comprova('entitats sense dades: només «Aviat hi trobareu les entitats adherides.», sense botó ni formulari d’adhesió', e.text === 'Aviat hi trobareu les entitats adherides.' && e.adhesio === 0 && e.filtres, JSON.stringify(e));
  comprova('entitats buides sense desbordament a 390 px ni errors', (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
{
  // Amb Supabase i cap entitat publicada: estat buit i cap enviament a sollicituds_entitats.
  BD = dadesInicials(); peticions = [];
  BD.entitats.push({ id: randomUUID(), nom: 'No publicada', tipus: 'associacio', municipi: 'Albons', descripcio: '', publicada: false });
  const pg = await pagina(ESCRIPTORI, true);
  await pg.goto(ORIGEN + '/entitats.html', { waitUntil: 'networkidle' });
  comprova('una entitat no publicada no es mostra', (await pg.textContent('#ent-llista')).includes('Aviat hi trobareu') && peticions.some((p) => p.url.includes('publicada=eq.true')));
  comprova('la pàgina no fa cap petició a sollicituds_entitats', !peticions.some((p) => p.url.includes('sollicituds_entitats')));
  comprova('entitats amb Supabase: cap error', pg.errors.length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
{
  BD = dadesInicials();
  BD.entitats.push(
    { id: randomUUID(), nom: 'Col·lectiu Àrids', tipus: 'collectiu', municipi: 'la Tallada d’Empordà', descripcio: 'Defensa dels camps.', web: 'https://exemple.cat', instagram: 'https://www.instagram.com/arids/', logo: U.E + '/logo.png', publicada: true },
    { id: randomUUID(), nom: 'Associació Veïnal B', tipus: 'entitat_veinal', municipi: 'Albons', descripcio: 'Veïns.', web: 'javascript:alert(1)', instagram: null, logo: null, publicada: true },
    { id: randomUUID(), nom: 'Amagada', tipus: 'associacio', municipi: 'Albons', descripcio: '', publicada: false });
  for (const vp of [MOBIL, ESCRIPTORI]) {
    const pg = await pagina(vp, true);
    await pg.goto(ORIGEN + '/entitats.html', { waitUntil: 'networkidle' });
    const d = await pg.evaluate(() => ({ n: document.querySelectorAll('.ent-card').length, filtres: !!document.querySelector('#ent-filtres, #ent-cerca, #ent-tipus, #ent-municipi, input[type=search]'),
      noms: [...document.querySelectorAll('.ent-card h3')].map((h) => h.textContent).join(),
      enllacos: [...document.querySelectorAll('.ent-card a')].map((a) => a.href + '|' + a.target + '|' + a.rel).join(' ; '), logo: document.querySelector('.ent-logo')?.alt,
      adhesio: !!document.querySelector('#adhesio, .adh-obre, form'),
      visita: [...document.querySelectorAll('.ent-card a.btn')].map((a) => a.textContent + '|' + a.target).join() }));
    comprova(`entitats @${vp.width}px: les dues publicades, per ordre alfabètic, sense cercador ni filtres`, d.n === 2 && !d.filtres && d.noms === 'Associació Veïnal B,Col·lectiu Àrids', JSON.stringify(d));
    comprova(`entitats @${vp.width}px: enllaços en pestanya nova amb noopener i cap enllaç javascript:`, !/javascript/.test(d.enllacos) && d.enllacos.split(' ; ').length === 2 && d.enllacos.split(' ; ').every((x) => /\|_blank\|noopener/.test(x)), d.enllacos);
    comprova(`entitats @${vp.width}px: logo amb text alternatiu i sense formulari d’adhesió`, d.logo === 'Logo de Col·lectiu Àrids' && !d.adhesio);
    comprova(`entitats @${vp.width}px: botó «Visita la web» en pestanya nova (només si hi ha web vàlida)`, d.visita === 'Visita la web|_blank', d.visita);
    comprova(`entitats @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/entitats-${vp.width}.png`, fullPage: true });
    await pg.context().close();
  }
}
{
  const pg = await pagina(MOBIL, false);
  await pg.goto(ORIGEN + '/eines.html', { waitUntil: 'networkidle' });
  comprova('eines sense Supabase: «Pròximament» · «Aviat hi trobareu eines per analitzar el territori»', (await pg.textContent('#eines-llista')).trim() === 'PròximamentAviat hi trobareu eines per analitzar el territori.');
  await pg.context().close();
}
{
  BD = dadesInicials(); peticions = [];
  BD.eines.push({ id: randomUUID(), nom: 'Amagada', organisme: 'X', descripcio: '', url: 'https://x.exemple.cat/', categoria: 'altres', ordre: 1, publicada: false });
  let pg = await pagina(ESCRIPTORI, true);
  await pg.goto(ORIGEN + '/eines.html', { waitUntil: 'networkidle' });
  comprova('eines amb Supabase i cap de publicada: missatge d’espera', (await pg.textContent('#eines-llista')).includes('Aviat hi trobareu eines') && peticions.some((p) => p.url.startsWith('/rest/v1/eines') && p.url.includes('publicada=eq.true')));
  await pg.context().close();
  BD.eines.push(
    { id: randomUUID(), nom: 'Visor B', organisme: 'Org B', descripcio: 'd', url: 'https://b.exemple.cat/', categoria: 'energia', ordre: 20, publicada: true },
    { id: randomUUID(), nom: 'Visor A', organisme: 'Org A', descripcio: 'd', url: 'https://a.exemple.cat/', categoria: 'urbanisme', ordre: 10, publicada: true });
  for (const vp of [MOBIL, ESCRIPTORI]) {
    pg = await pagina(vp, true);
    await pg.goto(ORIGEN + '/eines.html', { waitUntil: 'networkidle' });
    const d = await pg.evaluate(() => ({ noms: [...document.querySelectorAll('.eina h3')].map((h) => h.textContent).join(),
      filtres: document.querySelectorAll('.filtre-btn, #eines-filtre').length,
      a: [...document.querySelectorAll('.eina a')].map((a) => a.target + '|' + a.rel).join() }));
    comprova(`eines @${vp.width}px: només les publicades, en l’ordre desat, en pestanya nova amb noopener`, d.noms === 'Visor A,Visor B' && d.a === '_blank|noopener noreferrer,_blank|noopener noreferrer', JSON.stringify(d));
    comprova(`eines @${vp.width}px: sense filtres de categoria`, d.filtres === 0);
    comprova(`eines @${vp.width}px: sense errors ni desbordament`, pg.errors.length === 0 && (await desbordament(pg)) <= 0, JSON.stringify(pg.errors));
    if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/eines-${vp.width}.png`, fullPage: true });
    await pg.context().close();
  }
}
{
  // Tauler: l'editor crea una entitat des de zero i la publica. Les sol·licituds d'adhesió ja no hi són.
  BD = dadesInicials(); peticions = [];
  BD.sollicituds_entitats.push({ id: randomUUID(), nom_entitat: 'Antiga', tipus: 'fundacio', municipi: 'Ultramort', descripcio: '', web: null, instagram: null,
    persona_contacte: 'Pere', email: 'pere@ex.cat', telefon: null, missatge: '', consentiment: true, estat: 'nova', created_at: new Date().toISOString() });
  const pg = await pagina(ESCRIPTORI, true);
  await pg.goto(ORIGEN + '/area-privada/', { waitUntil: 'networkidle' });
  await pg.fill('#email', 'editor@ex.cat'); await pg.fill('#contrasenya', PW); await pg.click('#f-login button[type=submit]');
  await pg.waitForURL(/panel/);
  await pg.goto(ORIGEN + '/area-privada/panel.html#/entitats', { waitUntil: 'networkidle' });
  await espera(pg, () => document.querySelector('#vista h1')?.textContent === 'Entitats');
  comprova('tauler: Entitats no avisa de sol·licituds ni les consulta', !/sol·licitud/i.test(await pg.textContent('#vista')) && !peticions.some((p) => p.url.includes('sollicituds_entitats')));
  await pg.goto(ORIGEN + '/area-privada/panel.html#/entitat/nova');
  await espera(pg, () => !!document.getElementById('e-nom'));
  await pg.fill('#e-nom', 'Entitat nova'); await pg.selectOption('#e-tipus', 'fundacio'); await pg.fill('#e-mun', 'Ultramort'); await pg.fill('#e-ig', '@ent_ex');
  await pg.check('#e-pub');
  await pg.click('#vista button[type=submit]');
  await espera(pg, () => /^#\/entitat\/[0-9a-f-]{36}$/.test(location.hash));
  const ent = BD.entitats[0] || {};
  comprova('tauler: l’entitat es crea publicada amb l’Instagram normalitzat', ent.nom === 'Entitat nova' && ent.publicada === true && ent.instagram === 'https://www.instagram.com/ent_ex/', JSON.stringify(ent));
  await pg.goto(ORIGEN + '/area-privada/panel.html#/entitats');
  await espera(pg, () => document.querySelector('#vista h1')?.textContent === 'Entitats' && !!document.querySelector('#vista .item'));  await pg.goto(ORIGEN + '/area-privada/panel.html#/entitats');
  await espera(pg, () => document.querySelector('#vista h1')?.textContent === 'Entitats' && !!document.querySelector('#vista .item'));
  await pg.click('#vista .item button:has-text("Despublica")');
  await espera(pg, () => !!document.querySelector('#vista .item button') && /Publica/.test(document.querySelector('#vista .item button').textContent));
  comprova('tauler: «Despublica» retira l’entitat de la web', ent.publicada === false);
  // L'editor també esborra entitats
  await pg.goto(ORIGEN + '/area-privada/panel.html#/entitats');
  await espera(pg, () => !!document.querySelector('#vista .item button[aria-label^="Elimina"]'));
  await pg.evaluate(() => { window.confirm = () => true; });
  await pg.click('#vista .item button[aria-label^="Elimina"]');
  comprova('tauler: l’editor pot eliminar entitats', await espera(pg, () => /eliminada/.test(document.getElementById('avisos').textContent)) && peticions.some((p) => p.m === 'DELETE' && p.url.startsWith('/rest/v1/entitats')));
  // Eines: crear (URL validada), ordenar i publicar
  await pg.goto(ORIGEN + '/area-privada/panel.html#/eina/nova');
  await espera(pg, () => !!document.getElementById('i-nom'));
  await pg.fill('#i-nom', 'Visor nou'); await pg.fill('#i-url', 'http://insegur.exemple.cat'); await pg.selectOption('#i-cat', 'altres');
  await pg.click('#vista button[type=submit]');
  comprova('tauler: una URL sense https:// es rebutja', /https:\/\//.test(await pg.textContent('#avisos')) && BD.eines.length === 0);
  await pg.fill('#i-url', 'https://segur.exemple.cat/visor');
  await pg.click('#vista button[type=submit]');
  await espera(pg, () => /^#\/eina\/[0-9a-f-]{36}$/.test(location.hash));
  comprova('tauler: l’eina es crea no publicada, amb categoria «altres»', BD.eines.length === 1 && BD.eines[0].publicada === false && BD.eines[0].categoria === 'altres' && BD.eines[0].ordre === 10, JSON.stringify(BD.eines));
  BD.eines.push({ id: randomUUID(), nom: 'Segona', organisme: '', descripcio: '', url: 'https://s.exemple.cat/', categoria: 'energia', ordre: 20, publicada: true });
  await pg.goto(ORIGEN + '/area-privada/panel.html#/eines');
  await espera(pg, () => document.querySelectorAll('#vista .item').length === 2);
  comprova('tauler: a la primera eina «Puja» està desactivat', await pg.$eval('#vista .item button[aria-label="Puja Visor nou"]', (b) => b.disabled));
  await pg.click('#vista .item button[aria-label="Baixa Visor nou"]');
  await espera(pg, () => document.querySelector('#vista .item h3')?.textContent === 'Segona');
  comprova('tauler: «Baixa» canvia l’ordre', BD.eines.find((x) => x.nom === 'Segona').ordre === 10 && BD.eines.find((x) => x.nom === 'Visor nou').ordre === 20);
  await pg.click('#vista button[aria-label="Publica Visor nou"]');
  await espera(pg, () => /publicada/.test(document.getElementById('avisos').textContent));
  comprova('tauler: «Publica» publica l’eina', BD.eines.find((x) => x.nom === 'Visor nou').publicada === true);
  comprova('tauler entitats: cap error', pg.errors.length === 0, JSON.stringify(pg.errors));
  if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/panel-entitats.png`, fullPage: true });
  await pg.context().close();
}

console.log('\n17. App de la zona privada (/app): PWA per blocs');
{
  const man = JSON.parse(await (await fetch(ORIGEN + '/app/manifest.webmanifest')).text());
  comprova('manifest propi: «Defensem Admin» / «Defensem», standalone, colors i icones amb el logo', man.name === 'Defensem Admin' && man.short_name === 'Defensem'
    && man.display === 'standalone' && man.theme_color === '#298d3b' && man.background_color === '#f1f0ee' && man.start_url === '/app/' && man.scope === '/app/'
    && man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable') && man.icons.some((i) => i.sizes === '192x192'), JSON.stringify(man));
  for (const i of man.icons) { const r = await fetch(ORIGEN + i.src); comprova(`icona ${i.src}`, r.status === 200 && r.headers.get('content-type') === 'image/png'); }
  const sw = await (await fetch(ORIGEN + '/app/sw.js')).text();
  comprova('service worker només per a /app, amb versió de memòria cau i sense desar dades (Supabase, /api)', /var VERSIO = 'defensem-app-v\d+'/.test(sw)
    && /url\.origin !== self\.location\.origin\) return/.test(sw) && /ARMADURA\.indexOf\(cami\) === -1\) return/.test(sw) && !/supabase\.co|\/api\//.test(sw.replace(/\/\*[\s\S]*?\*\//, '')));
  const red = await fetch(ORIGEN + '/app', { redirect: 'manual' });
  comprova('/app → /app/', [301, 308].includes(red.status) && red.headers.get('location') === '/app/');
  const html = await (await fetch(ORIGEN + '/app/')).text();
  comprova('/app: manifest, noindex i mode clar', /<link rel="manifest" href="\/app\/manifest\.webmanifest">/.test(html) && /noindex/.test(html) && /<meta name="color-scheme" content="light">/.test(html));
}
const entraApp = async (pg, email) => {
  await pg.goto(ORIGEN + '/app/', { waitUntil: 'networkidle' });
  await pg.fill('#a-email', email); await pg.fill('#a-pw', PW); await pg.click('form button[type=submit]');
  await pg.waitForSelector('.app-blocs');
};
const blocs = (pg) => pg.$$eval('.app-bloc-nom', (l) => l.map((x) => x.textContent));
{
  BD = dadesInicials(); peticions = []; pujades = [];
  BD.actes.push({ id: randomUUID(), titol: 'Acte ocult', data: '2026-12-01', hora: null, data_fi: null, quan: '', lloc: 'Albons', descripcio: '', organitza: '', cartell: null, publicada: false, updated_at: new Date().toISOString() });
  const pg = await pagina(MOBIL, true);
  await pg.goto(ORIGEN + '/app/', { waitUntil: 'networkidle' });
  comprova('app: sense sessió, pantalla d’accés', !!(await pg.$('#a-email')) && !(await pg.$('.app-blocs')));
  await pg.fill('#a-email', 'editor@ex.cat'); await pg.fill('#a-pw', 'dolenta-123'); await pg.click('form button[type=submit]');
  comprova('app: contrasenya incorrecta → missatge clar', await espera(pg, () => /Correu o contrasenya incorrectes/.test(document.getElementById('avisos').textContent)));
  await pg.fill('#a-pw', PW); await pg.click('form button[type=submit]'); await pg.waitForSelector('.app-blocs');
  comprova('app (editor): blocs Notícies, Agenda, Projectes, Informació, Entitats, Eines, Pàgines, Documents i El meu perfil (sense Usuaris)',
    (await blocs(pg)).join() === 'Notícies,Agenda,Projectes,Informació,Entitats,Eines,Pàgines,Documents,El meu perfil', (await blocs(pg)).join());
  await espera(pg, () => [...document.querySelectorAll('.app-compte')].filter((c) => !c.hidden).length >= 2);
  const comptes = await pg.$$eval('.app-bloc', (l) => l.map((b) => b.querySelector('.app-bloc-nom').textContent + ':' + (b.querySelector('.app-compte:not([hidden])')?.textContent || '')));
  comprova('app: comptadors de pendents (notícies en revisió, actes ocults) i cap de sol·licituds', comptes.includes('Notícies:1 en revisió') && comptes.includes('Agenda:1 ocult')
    && !comptes.some((c) => /Sol·licitud/.test(c)) && !peticions.some((p) => p.url.includes('sollicituds_entitats')), comptes.join(' | '));
  comprova('app: sense desbordament a 390 px i sense l’avís d’error d’abans d’entrar', (await desbordament(pg)) <= 0 && !(await pg.textContent('#avisos')));
  if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/app-inici.png`, fullPage: true });
  // Agenda: llista, pestanyes, + Nou, formulari amb foto comprimida, borrador, publicar
  await pg.click('a.app-bloc[href="#/agenda"]'); await pg.waitForSelector('.app-pestanyes');
  const ll = await pg.evaluate(() => ({ inici: document.querySelector('.app-inici')?.textContent, nou: document.querySelector('.app-nou')?.textContent,
    tabs: [...document.querySelectorAll('.app-pestanya')].map((b) => b.childNodes[0].textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join() }));
  comprova('app Agenda: «← Inici», «+ Nou acte» i pestanyes Publicades · Ocultes', ll.inici === '← Inici' && ll.nou === '+ Nou acte' && ll.tabs === 'Publicades*,Ocultes', JSON.stringify(ll));
  await pg.click('.app-pestanya[data-p="ocultes"]');
  comprova('app Agenda: a «Ocultes» hi ha l’acte ocult', (await pg.textContent('#app-llista')).includes('Acte ocult'));
  await pg.click('.app-nou'); await pg.waitForSelector('#f-titol');
  await pg.fill('#f-titol', 'Xerrada a Verges'); await pg.fill('#f-data', '2026-12-12'); await pg.fill('#f-lloc', 'Verges');
  await pg.waitForTimeout(800);
  comprova('app: borrador automàtic al dispositiu mentre s’escriu', await pg.evaluate(() => /Xerrada a Verges/.test(localStorage.getItem('defensem.app.esborrany.agenda.nou') || '')));
  await pg.reload({ waitUntil: 'networkidle' }); await pg.waitForSelector('#f-titol');
  comprova('app: en tornar-hi, es recupera el borrador', (await pg.inputValue('#f-titol')) === 'Xerrada a Verges' && /recuperat l’esborrany/.test(await pg.textContent('#vista')));
  // foto gran (3000 × 2000) → es comprimeix abans de pujar-la
  const png = await pg.evaluate(async () => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const x = c.getContext('2d');
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i * 7},70%,50%)`; x.fillRect(Math.random() * 3000, Math.random() * 2000, 300, 200); }
    const b = await new Promise((ok) => c.toBlob(ok, 'image/png')); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  await pg.setInputFiles('#f-cartell', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  comprova('app: la foto es prepara comprimida', await espera(pg, () => /Foto preparada/.test(document.getElementById('avisos').textContent)) && !!(await pg.$('.app-foto-prev img')));
  if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/app-form.png`, fullPage: true });
  await pg.click('.app-accions button:has-text("Vista prèvia")');
  comprova('app: vista prèvia', /Xerrada a Verges/.test(await pg.textContent('.app-previ')));
  await pg.click('.app-accions button:has-text("Publica")');
  await espera(pg, () => /Publicat/.test(document.getElementById('avisos').textContent));
  const acte = BD.actes.find((a) => a.titol === 'Xerrada a Verges') || {};
  comprova('app: «Publica» crea l’acte publicat amb el cartell pujat', acte.publicada === true && acte.data === '2026-12-12' && acte.lloc === 'Verges' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(acte.cartell || ''), JSON.stringify(acte));
  const p = pujades[pujades.length - 1] || {};
  comprova('app: la foto pujada és un JPEG reduït a 1600 px com a màxim (era de 3000 × 2000) i més lleuger', JSON.stringify(p.mides) === '[1600,1067]'
    && p.mida < png.length, JSON.stringify({ mides: p.mides, pujada: p.mida, original: png.length }));
  comprova('app: el borrador s’esborra en desar', await pg.evaluate(() => localStorage.getItem('defensem.app.esborrany.agenda.nou') === null));
  await pg.waitForSelector('.app-accions button:has-text("Oculta")');
  await pg.click('.app-accions button:has-text("Oculta")');
  comprova('app: «Oculta» la retira de la web', await espera(pg, () => /Ocultat/.test(document.getElementById('avisos').textContent)) && acte.publicada === false);
  await pg.evaluate(() => { window.confirm = () => true; });
  await pg.waitForSelector('.app-accions button:has-text("Esborra")');
  await pg.click('.app-accions button:has-text("Esborra")');
  comprova('app: «Esborra» amb confirmació', await espera(pg, () => /^#\/agenda(\?|$)/.test(location.hash)) && !BD.actes.some((a) => a.titol === 'Xerrada a Verges'));
  // Notícies: l'editor veu «En revisió» i pot publicar o retornar amb nota
  await pg.goto(ORIGEN + '/app/#/noticies?p=revisio'); await pg.waitForSelector('.app-pestanyes');
  const tabsN = await pg.$$eval('.app-pestanya', (l) => l.map((b) => b.childNodes[0].textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join());
  comprova('app Notícies: pestanyes Esborranys · En revisió · Publicades', tabsN === 'Esborranys,En revisió*,Publicades', tabsN);
  await pg.click('#app-llista .app-targeta'); await pg.waitForSelector('#f-titol');
  await pg.click('.app-accions button:has-text("Retorna a l’autor")'); await pg.click('button:has-text("Confirma el retorn")');
  comprova('app: retornar sense nota no es pot', /Escriu què cal corregir/.test(await pg.textContent('#avisos')));
  await pg.fill('#f-nota', 'Falta la font.'); await pg.click('button:has-text("Confirma el retorn")');
  const pend = BD.publicacions.find((x) => x.titol === 'Pendent del Carles');
  comprova('app: «Retorna a l’autor» amb la nota', await espera(pg, () => /Retornada/.test(document.getElementById('avisos').textContent)) && pend.estat === 'retornat' && pend.nota_revisio === 'Falta la font.');
  // Sol·licituds: el bloc ja no existeix; les entitats es creen des de «+ Nova entitat»
  await pg.goto(ORIGEN + '/app/#/sollicituds'); await pg.waitForSelector('#vista h1');
  comprova('app: #/sollicituds ja no és cap secció', (await pg.textContent('#vista h1')) === 'No hem trobat aquesta secció.');
  await pg.goto(ORIGEN + '/app/#/entitats'); await pg.waitForSelector('.app-nou');
  await pg.click('.app-nou'); await pg.waitForSelector('#f-nom');
  await pg.fill('#f-nom', 'Entitat nova'); await pg.selectOption('#f-tipus', 'collectiu'); await pg.fill('#f-instagram', '@nova');
  await pg.click('.app-accions button:has-text("Desa")');
  await espera(pg, () => /Desat/.test(document.getElementById('avisos').textContent));
  const ent = BD.entitats.find((x) => x.nom === 'Entitat nova') || {};
  comprova('app: l’entitat es crea oculta amb l’Instagram normalitzat', ent.publicada !== true && ent.instagram === 'https://www.instagram.com/nova/', JSON.stringify(ent));
  // Perfil i tancar la sessió
  await pg.goto(ORIGEN + '/app/#/perfil'); await pg.waitForSelector('button:has-text("Tanca la sessió")');
  comprova('app: el perfil mostra el rol', /Editor/.test(await pg.textContent('.app-dades')));
  await pg.click('button:has-text("Tanca la sessió")');
  comprova('app: «Tanca la sessió» torna a l’accés i esborra els borradors', await espera(pg, () => !!document.getElementById('a-email'))
    && await pg.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('defensem.app.esborrany.'))));
  comprova('app (editor): cap error (a part del 400 esperat de la contrasenya incorrecta)', pg.errors.filter((e) => !/status of 400/.test(e)).length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
{
  const pg = await pagina(MOBIL, true);
  await entraApp(pg, 'col@ex.cat');
  comprova('app (col·laborador): només Notícies, Documents i El meu perfil', (await blocs(pg)).join() === 'Notícies,Documents,El meu perfil', (await blocs(pg)).join());
  await pg.click('a.app-bloc[href="#/noticies"]'); await pg.click('.app-nou'); await pg.waitForSelector('#f-titol');
  const bt = await pg.$$eval('.app-accions button', (l) => l.map((b) => b.textContent).join());
  comprova('app (col·laborador): pot desar i enviar a revisió, però no publicar', bt === 'Vista prèvia,Desa,Envia a revisió', bt);
  await pg.fill('#f-titol', 'Notícia del Carles'); await pg.click('.app-accions button:has-text("Envia a revisió")');
  comprova('app (col·laborador): «On es publica?» és obligatori', /Omple «On es publica\?»/.test(await pg.textContent('#avisos')) && !BD.publicacions.some((x) => x.titol === 'Notícia del Carles'));
  await pg.selectOption('#f-seccio', 'defensem'); await pg.click('.app-accions button:has-text("Envia a revisió")');
  const n = await espera(pg, () => /revisió/.test(document.getElementById('avisos').textContent)) && BD.publicacions.find((x) => x.titol === 'Notícia del Carles');
  comprova('app (col·laborador): la notícia queda en revisió', n && n.estat === 'pendent' && n.autor_id === U.C, JSON.stringify(n));
  await pg.goto(ORIGEN + '/app/#/agenda'); await pg.waitForSelector('h1');
  comprova('app (col·laborador): no entra a Agenda', /No hi tens accés/.test(await pg.textContent('#vista')));
  await pg.context().close();
}
{
  const pg = await pagina(ESCRIPTORI, true);
  await entraApp(pg, 'admin@ex.cat');
  comprova('app (admin): també Usuaris', (await blocs(pg)).includes('Usuaris'));
  await pg.click('a.app-bloc[href="#/usuaris"]'); await pg.waitForSelector('.app-pestanyes');
  comprova('app Usuaris: «+ Convida» i pestanyes Actius · Desactivats', (await pg.textContent('.app-nou')) === '+ Convida'
    && (await pg.$$eval('.app-pestanya', (l) => l.map((b) => b.childNodes[0].textContent).join())) === 'Actius,Desactivats');
  if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/app-usuaris-1280.png`, fullPage: true });
  comprova('app (admin): cap error ni desbordament', pg.errors.length === 0 && (await desbordament(pg)) <= 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
console.log('\n17b. App: notícies per secció, projectes, informació (PDF), pàgines i rols');
{
  BD = dadesInicials(); peticions = []; pujades = [];
  BD.publicacions.push({ id: randomUUID(), seccio: 'renovables', tipus: 'noticia', titol: 'Renovable existent', mitja: 'Diari X', resum: 'r', contingut: '', imatge: null, font_url: 'https://diari.exemple.cat/x',
    data: '2026-10-01', projecte: null, estat: 'publicat', nota_revisio: null, autor_id: U.E, created_at: '', updated_at: new Date().toISOString(), published_at: new Date().toISOString() });
  BD.projectes.push({ id: 'la-tallada', titol: 'Aerogeneradors de La Tallada', descripcio: 'Desc.', mapa: null, mapa_enllac: null, situacio: '', publicada: false, updated_at: new Date().toISOString() },
    { id: 'albons', titol: 'Aerogenerador d’Albons', descripcio: 'Desc.', mapa: null, mapa_enllac: null, situacio: 'En informació pública.', publicada: true, updated_at: new Date().toISOString() });
  BD.pagines.push({ clau: 'qui-som', titol: 'Qui som: text', contingut: 'Som una iniciativa ciutadana.', ordre: 10 },
    { clau: 'el-projecte', titol: 'Qui som: introducció d’«El projecte»', contingut: 'Ja no es fa servir.', ordre: 20 }, { clau: 'peu-lema', titol: 'Peu de pàgina: lema', contingut: 'Pensem en el que tenim.', ordre: 30 });
  const pg = await pagina(MOBIL, true);
  await entraApp(pg, 'editor@ex.cat');
  // Notícies: filtre Totes · Defensem · Renovables
  await pg.goto(ORIGEN + '/app/#/noticies?p=publicades'); await pg.waitForSelector('.app-filtre');
  const xips = await pg.$$eval('.app-xip', (l) => l.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join());
  comprova('app Notícies: filtre Totes · Defensem · Renovables', xips === 'Totes*,Defensem,Renovables', xips);
  comprova('app Notícies: «Totes» mostra les dues seccions', (await textos(pg, '#app-llista h3')).sort().join() === 'Comunicat publicat,Renovable existent');
  await pg.click('.app-xip[data-f=renovables]');
  comprova('app Notícies: «Renovables» filtra (i ho recorda a l’adreça)', (await textos(pg, '#app-llista h3')).join() === 'Renovable existent' && /f=renovables/.test(pg.url())
    && /Renovables · Diari X/.test(await pg.textContent('#app-llista')));
  // Nova notícia de renovables: camps propis i projecte relacionat
  await pg.goto(ORIGEN + '/app/#/noticies/nou'); await pg.waitForSelector('#f-seccio');
  const primer = await pg.$eval('form.app-form .app-camp', (c) => c.querySelector('label').textContent + '|' + c.querySelector('select').value);
  comprova('app: el primer camp és «On es publica?» (obligatori, sense triar)', primer === 'On es publica? *|', primer);
  const vis = () => pg.$$eval('form.app-form .app-camp', (l) => l.filter((c) => !c.hidden).map((c) => (c.querySelector('label, .app-etiq').textContent || '').replace(' *', '')).join('|'));
  await pg.selectOption('#f-seccio', 'renovables');
  comprova('app: Renovables → títol, mitjà, data, resum, URL de la font i projecte', (await vis()) === 'On es publica?|Títol|Mitjà|Data|Resum (una o dues frases)|Adreça de la font (https://)|Projecte relacionat', await vis());
  await pg.selectOption('#f-seccio', 'defensem');
  comprova('app: Defensem → títol, tipus, data, imatge, resum i text complet', (await vis()) === 'On es publica?|Títol|Tipus|Data|Imatge|Resum (una o dues frases)|Text complet|Projecte relacionat', await vis());
  comprova('app: «Projecte relacionat»: Cap · La Tallada · Albons', (await pg.$$eval('#f-projecte option', (l) => l.map((o) => o.textContent).join())) === 'Cap,La Tallada,Albons');
  await pg.selectOption('#f-seccio', 'renovables');
  await pg.fill('#f-titol', 'Nova renovable'); await pg.fill('#f-mitja', 'Ràdio Y'); await pg.fill('#f-data', '2026-10-20'); await pg.fill('#f-resum', 'Resum meu.');
  await pg.fill('#f-font_url', 'http://insegur.exemple.cat'); await pg.selectOption('#f-projecte', 'albons');
  await pg.click('.app-accions button:has-text("Publica")');
  comprova('app: la font ha de ser https://', /https:\/\//.test(await pg.textContent('#avisos')) && !BD.publicacions.some((x) => x.titol === 'Nova renovable'));
  await pg.fill('#f-font_url', 'https://radio.exemple.cat/n');
  await pg.click('.app-accions button:has-text("Vista prèvia")');
  comprova('app: vista prèvia de renovables amb «Llegeix-la a la font»', /Ràdio Y/.test(await pg.textContent('.app-previ')) && (await pg.textContent('.app-previ a')) === 'Llegeix-la a la font');
  await pg.click('.app-accions button:has-text("Publica")');
  await espera(pg, () => /Publicat/.test(document.getElementById('avisos').textContent));
  const nr = BD.publicacions.find((x) => x.titol === 'Nova renovable') || {};
  comprova('app: es desa a renovables amb mitjà, data, font i projecte', nr.seccio === 'renovables' && nr.mitja === 'Ràdio Y' && nr.data === '2026-10-20' && nr.font_url === 'https://radio.exemple.cat/n'
    && nr.projecte === 'albons' && nr.estat === 'publicat', JSON.stringify(nr));
  await pg.waitForSelector('#f-seccio'); await pg.selectOption('#f-seccio', 'defensem'); await pg.click('.app-accions button:has-text("Desa")');
  await espera(pg, () => /Desat/.test(document.getElementById('avisos').textContent));
  comprova('app: es pot canviar de secció després', nr.seccio === 'defensem');
  await pg.waitForSelector('.app-accions button:has-text("Esborra")');
  comprova('app (editor): pot esborrar notícies', (await textos(pg, '.app-accions button')).includes('Esborra'));
  // Projectes: els dos, sense «+ Nou» ni «Esborra»
  await pg.goto(ORIGEN + '/app/#/projectes'); await pg.waitForSelector('.app-pestanyes');
  comprova('app Projectes: sense «+ Nou», un publicat i un d’ocult', !(await pg.$('.app-nou')) && (await textos(pg, '#app-llista h3')).join() === 'Aerogenerador d’Albons');
  await pg.click('.app-pestanya[data-p=ocultes]'); await pg.click('#app-llista .app-targeta'); await pg.waitForSelector('#f-situacio');
  comprova('app Projecte: descripció, mapa, enllaç al mapa i situació actual; Desa i Publica, sense Esborra', (await textos(pg, '.app-accions button')).join() === 'Vista prèvia,Desa,Publica'
    && !!(await pg.$('#f-descripcio')) && !!(await pg.$('#f-mapa')) && !!(await pg.$('#f-mapa_enllac')));
  await pg.fill('#f-situacio', 'Tramitació aturada.'); await pg.click('.app-accions button:has-text("Publica")');
  await espera(pg, () => /Publicat/.test(document.getElementById('avisos').textContent));
  const pt = BD.projectes.find((x) => x.id === 'la-tallada');
  comprova('app Projecte: es desa i es publica', pt.situacio === 'Tramitació aturada.' && pt.publicada === true && /#\/projectes\/la-tallada/.test(pg.url()), JSON.stringify(pt));
  // Informació: bloc buit, pujar un PDF
  await pg.goto(ORIGEN + '/app/#/informacio'); await pg.waitForSelector('.app-buit-bloc');
  comprova('app Informació buida: «Encara no hi ha res. Toca + Nou document per començar.»', (await pg.textContent('.app-buit-bloc')) === 'Encara no hi ha res. Toca + Nou document per començar.');
  await pg.click('.app-nou'); await pg.waitForSelector('#f-categoria');
  await pg.setInputFiles('#f-fitxer', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('x') });
  comprova('app Informació: només accepta PDF', /PDF/.test(await pg.textContent('#avisos')));
  await pg.setInputFiles('#f-fitxer', { name: 'model.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n' + 'x'.repeat(30000)) });
  await pg.fill('#f-titol', 'Model d’al·legació'); await pg.fill('#f-categoria', 'Al·legacions'); await pg.fill('#f-data', '2026-10-10'); await pg.selectOption('#f-projecte', 'la-tallada');
  await pg.click('.app-accions button:has-text("Publica")');
  await espera(pg, () => /Publicat/.test(document.getElementById('avisos').textContent));
  const d = BD.informacio[0] || {};
  comprova('app Informació: el PDF es puja al bucket «informacio» i es desa amb categoria, data, mida i projecte', /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(d.fitxer || '')
    && d.fitxer.startsWith(U.E + '/') && d.categoria === 'Al·legacions' && d.data === '2026-10-10' && d.mida === 30009 && d.projecte === 'la-tallada' && d.publicada === true
    && pujades.some((x) => x.bucket === 'informacio'), JSON.stringify(d));
  await pg.goto(ORIGEN + '/app/#/informacio/nou'); await pg.waitForSelector('#f-categoria');
  await espera(pg, () => document.querySelectorAll('#f-categoria-llista option').length === 1);
  comprova('app Informació: suggereix les categories que ja hi ha', (await pg.$eval('#f-categoria-llista option', (o) => o.value)) === 'Al·legacions');
  // Pàgines: textos de Qui som i del peu; només «Desa»
  await pg.goto(ORIGEN + '/app/#/pagines'); await pg.waitForSelector('#app-llista .app-targeta');
  comprova('app Pàgines: els textos, en ordre (sense «el-projecte», que ja no es fa servir), sense «+ Nou» ni pestanyes', (await textos(pg, '#app-llista h3')).join() === 'Qui som: text,Peu de pàgina: lema' && !(await pg.$('.app-nou, .app-pestanyes')));
  await pg.click('#app-llista li:nth-child(2) .app-targeta'); await pg.waitForSelector('#f-contingut');
  comprova('app Pàgina: només «Vista prèvia» i «Desa»', (await textos(pg, '.app-accions button')).join() === 'Vista prèvia,Desa');
  await pg.fill('#f-contingut', 'Lema nou.'); await pg.click('.app-accions button:has-text("Desa")');
  await espera(pg, () => /Desat/.test(document.getElementById('avisos').textContent));
  comprova('app Pàgina: el text es desa', BD.pagines.find((x) => x.clau === 'peu-lema').contingut === 'Lema nou.');
  comprova('app (editor, blocs nous): sense errors ni desbordament', pg.errors.length === 0 && (await desbordament(pg)) <= 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
{
  // Usuari de consulta: ho veu tot, però només per consultar
  const pg = await pagina(MOBIL, true);
  await entraApp(pg, 'consulta@ex.cat');
  comprova('app (consulta): veu tots els blocs de contingut (sense Usuaris)', (await blocs(pg)).join() === 'Notícies,Agenda,Projectes,Informació,Entitats,Eines,Pàgines,Documents,El meu perfil', (await blocs(pg)).join());
  await pg.click('a.app-bloc[href="#/noticies"]'); await pg.waitForSelector('#app-llista');
  comprova('app (consulta): sense «+ Nou»', !(await pg.$('.app-nou')));
  await pg.click('.app-pestanya[data-p=revisio]'); await pg.click('#app-llista .app-targeta'); await pg.waitForSelector('#f-titol');
  comprova('app (consulta): la notícia es veu però no es pot canviar (només «Vista prèvia»)', await pg.$eval('#f-titol', (i) => i.disabled)
    && (await textos(pg, '.app-accions button')).join() === 'Vista prèvia' && /Només ho pots consultar/.test(await pg.textContent('#vista')));
  await pg.goto(ORIGEN + '/app/#/pagines'); await pg.waitForSelector('#app-llista .app-targeta'); await pg.click('#app-llista .app-targeta'); await pg.waitForSelector('#f-contingut');
  comprova('app (consulta): els textos tampoc', await pg.$eval('#f-contingut', (i) => i.disabled) && (await textos(pg, '.app-accions button')).join() === 'Vista prèvia');
  await pg.goto(ORIGEN + '/app/#/agenda/nou'); await pg.waitForSelector('#vista h1');
  comprova('app (consulta): #/…/nou → «No hi tens accés.»', (await pg.textContent('#vista h1')) === 'No hi tens accés.');
  comprova('app (consulta): sense errors', pg.errors.length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}
{
  // L'agenda pública es llegeix de Supabase (només publicats) quan la taula existeix
  BD = dadesInicials();
  BD.actes.push({ id: randomUUID(), titol: 'Acte de Supabase', data: '2099-05-01', hora: '18:30:00', data_fi: null, quan: '', lloc: 'Albons', descripcio: 'Text.', organitza: 'Mobilitzem (@mobilitzem_la_llera).', cartell: null, publicada: true },
    { id: randomUUID(), titol: 'No publicat', data: '2099-06-01', hora: null, data_fi: null, quan: '', lloc: '', descripcio: '', organitza: '', cartell: null, publicada: false },
    { id: randomUUID(), titol: 'Passat', data: '2020-01-01', hora: null, data_fi: null, quan: '1 de gener del 2020', lloc: '', descripcio: '', organitza: '', cartell: '/img/agenda/assemblea-general-oberta.webp', publicada: true });
  // la taula d'actes és pública només per als publicats
  const pg = await pagina(MOBIL, true);
  await pg.route(SB + '/rest/v1/actes*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(BD.actes.filter((a) => a.publicada).sort((a, b) => a.data.localeCompare(b.data))) }));
  await pg.goto(ORIGEN + '/actualitat.html', { waitUntil: 'networkidle' });
  const ag = await pg.evaluate(() => ({ propers: [...document.querySelectorAll('#actes > li h3')].map((h) => h.textContent), passats: [...document.querySelectorAll('#actes-fets > li h3')].map((h) => h.textContent),
    quan: document.querySelector('#actes time')?.textContent, ig: document.querySelector('#actes .org a')?.href, obert: document.getElementById('actes-anteriors').open,
    cartell: document.querySelector('#actes-fets img')?.getAttribute('src') }));
  comprova('agenda pública des de Supabase: propers a dalt, passats a «Actes anteriors» (tancat), sense els ocults', ag.propers.join() === 'Acte de Supabase' && ag.passats.join() === 'Passat' && !ag.obert
    && /1 de maig del 2099 · 18\.30 h/i.test(ag.quan) && ag.ig === 'https://www.instagram.com/mobilitzem_la_llera/' && ag.cartell === '/img/agenda/assemblea-general-oberta-petit.webp', JSON.stringify(ag));
  await pg.context().close();
}

await nav.close();
servidor.close();
console.log(`\n${ok} correctes, ${ko} fallades.`);
process.exit(ko ? 1 : 0);
