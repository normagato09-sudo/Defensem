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
      { id: randomUUID(), tipus: 'noticia', titol: 'Esborrany del Carles', resum: '', contingut: '<p>hola</p>', imatge: null, estat: 'esborrany', nota_revisio: null, autor_id: U.C, created_at: ara, updated_at: ara, published_at: null },
      { id: randomUUID(), tipus: 'noticia', titol: 'Pendent del Carles', resum: 'r', contingut: '<p>text</p>', imatge: null, estat: 'pendent', nota_revisio: null, autor_id: U.C, created_at: ara, updated_at: ara, published_at: null },
      { id: randomUUID(), tipus: 'noticia', titol: 'Retornada del Carles', resum: '', contingut: '', imatge: null, estat: 'retornat', nota_revisio: 'Falta la font de les dades.', autor_id: U.C, created_at: ara, updated_at: ara, published_at: null },
      { id: randomUUID(), tipus: 'comunicat', titol: 'Comunicat publicat', resum: 'Resum del comunicat', imatge: U.E + '/portada.jpg', estat: 'publicat', nota_revisio: null, autor_id: U.E, created_at: ara, updated_at: ara, published_at: ara,
        contingut: '<p>Text <b>important</b>.</p><script>window.__xss=1</script><img src=x onerror="window.__xss=2"><a href="javascript:window.__xss=3">mal</a><p style="color:red" onclick="window.__xss=4">estil</p><a href="https://exemple.cat">bo</a>' }
    ],
    documents: [{ id: randomUUID(), titol: 'Acta de l’assemblea', descripcio: 'Acta', enllac: 'https://exemple.cat/acta.pdf', created_by: U.A, created_at: ara }],
    permisos_document: []
  };
}
let BD = dadesInicials(), peticions = [], fallaLogout = false;
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
    .map(({ id, tipus, titol, resum, contingut, imatge, published_at }) => ({ id, tipus, titol, resum, contingut, imatge, published_at }));
  if (!u) return null;
  if (taula === 'profiles') return BD.profiles.filter((p) => p.id === u.id || rol === 'admin');
  if (taula === 'noms_usuaris') return ['admin', 'editor'].includes(rol) ? BD.profiles.map(({ id, nom }) => ({ id, nom })) : [];
  if (taula === 'publicacions') return BD.publicacions.filter((p) => ['admin', 'editor'].includes(rol) || (rol === 'col_laborador' && p.autor_id === u.id));
  if (taula === 'documents') return BD.documents.filter((d) => rol === 'admin' || (rol && BD.permisos_document.some((x) => x.document_id === d.id && x.usuari_id === u.id)));
  if (taula === 'permisos_document') return BD.permisos_document.filter((x) => rol === 'admin' || x.usuari_id === u.id);
  return null;
}
function filtra(files, params) {
  for (const [k, v] of params) if (v.startsWith('eq.')) files = files.filter((f) => String(f[k]) === v.slice(3));
  const o = params.get('order');
  if (o) { const [c, dir] = o.split('.'); files = [...files].sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (dir === 'desc' ? -1 : 1)); }
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
    const vis = visibles(taula, u);
    if (vis === null) return json(401, { code: '42501', message: 'permission denied for table ' + taula });
    if (m === 'GET' || m === 'HEAD') {
      const f = filtra(vis, url.searchParams);
      if (m === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-range': '0-' + Math.max(f.length - 1, 0) + '/' + f.length } });
      return json(200, f, { 'content-range': '0-' + Math.max(f.length - 1, 0) + '/' + f.length });
    }
    if (m === 'POST') {
      const nous = [].concat(JSON.parse(req.postData())).map((d) => ({ id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...d }));
      BD[taula].push(...nous);
      return json(201, filtra(nous, new URLSearchParams({ select: url.searchParams.get('select') || '*' })));
    }
    if (m === 'PATCH') {
      const canvis = JSON.parse(req.postData());
      const f = filtra(vis, new URLSearchParams([...url.searchParams].filter(([k]) => k !== 'select')));
      f.forEach((x) => Object.assign(BD[taula].find((y) => y.id === x.id), canvis));
      return json(200, f.map((x) => ({ id: x.id })));
    }
    if (m === 'DELETE') return json(200, []);
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

const PAGINES = ['/', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html?id=no-valid',
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

console.log('\n3. La web pública continua igual');
{
  const pg = await pagina(ESCRIPTORI, false);
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
  comprova('seccions en ordre: hero, Qui som, El projecte, Què pots fer, Agenda, minijoc, Notícies, Preguntes i Contacte',
    JSON.stringify(await pg.$$eval('main > section', (l) => l.map((s) => s.id || s.className))) === JSON.stringify(['hero', 'qui-som', 'el-projecte', 'actua', 'agenda', 'joc', 'noticies', 'preguntes', 'contacte']),
    JSON.stringify(await pg.$$eval('main > section', (l) => l.map((s) => s.id || s.className))));
  comprova('menú: Qui som, El projecte, Agenda, Notícies i Contacte', (await textos(pg, '#nav a')).join() === 'Qui som,El projecte,Agenda,Notícies,Contacte');
  comprova('logo del hero en alta resolució (640 × 468, WebP)', await pg.$eval('.hero-logo', (p) => p.querySelector('source').srcset === '/img/logo-defensem-2x.webp'
    && p.querySelector('img').getAttribute('src') === '/img/logo-defensem-2x.png' && p.querySelector('img').getAttribute('width') === '640' && p.querySelector('img').getAttribute('height') === '468'
    && p.querySelector('img').naturalWidth >= 640));
  comprova('il·lustració de molins i plaques (sense el SVG antic)', !!(await pg.$('.hero .molins')) && !(await pg.$('svg.paisatge, .rot')));
  await pg.$eval('.foto img', (i) => i.scrollIntoView()); await pg.waitForTimeout(400);
  comprova('la foto carrega', await pg.$eval('.foto img', (i) => i.complete && i.naturalWidth > 0));
  comprova('correu de contacte', !!(await pg.$('a[href="mailto:defensemlempordanet@gmail.com"]')));
  comprova('Instagram ocult sense URL', await pg.$eval('#ig-contacte', (e) => e.hidden) && !(await pg.$('.ig')));
  {
    const s = await pg.$eval('.cta a.btn:not(.o)', (a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent,
      label: a.getAttribute('aria-label'), boto: !!document.querySelector('.cta button'), aviat: /Properament/.test(document.body.textContent) }));
    comprova('«Fes-te’n soci o sòcia» és un enllaç al formulari de Google',
      s.href === 'https://docs.google.com/forms/d/e/1FAIpQLSf6IsYYaV5FMGA-Qw-Khk-ff-6PxW5JrYaxLETymXJ7eg7CJg/viewform' && s.text === 'Fes-te’n soci o sòcia' && !s.boto, JSON.stringify(s));
    comprova('«Fes-te’n soci o sòcia» s’obre en una pestanya nova (target _blank, rel noopener noreferrer)', s.target === '_blank' && s.rel === 'noopener noreferrer', JSON.stringify(s));
    comprova('«Fes-te’n soci o sòcia»: text accessible i sense «Properament»', s.label === 'Fes-te’n soci o sòcia (s’obre en una pestanya nova, formulari de Google)' && !s.aviat, JSON.stringify(s));
    comprova('ja no hi ha cap «Signa la petició» a la portada', !/Signa la petició/.test(await pg.textContent('body')));
    const sec = await pg.$eval('.cta a.btn.o', (a) => [a.getAttribute('href'), a.textContent].join());
    comprova('el segon botó del hero porta a «El projecte»', sec === '#el-projecte,El projecte', sec);
    const forms = await pg.$$eval('a[href*="docs.google.com/forms"]', (l) => l.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    comprova(`tots els enllaços al formulari (${forms.length}: hero, Què pots fer, joc i Contacte) són el mateix i s’obren a part`, forms.length === 4
      && forms.every((f) => f.href === forms[0].href && f.target === '_blank' && /noopener/.test(f.rel)), JSON.stringify(forms));
    comprova('el formulari de Google no està incrustat', !(await pg.$('iframe[src*="docs.google.com"]')));
  }
  comprova('notícies buides amb el missatge', /Encara no hi ha notícies publicades/.test(await pg.$eval('#news', (e) => e.textContent)));
  comprova('cap cookie i al localStorage només la clau de consentiment', (await pg.context().cookies()).length === 0 &&
    (await pg.evaluate(() => Object.keys(localStorage).join())) === CC_CLAU);
  for (const f of ['/', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html', '/404.html']) {
    await pg.goto(ORIGEN + f, { waitUntil: 'networkidle' });
    const p = await pg.evaluate(() => ({ legal: [...document.querySelectorAll('footer .legal a')].map((a) => a.textContent.trim()),
      privada: !!document.querySelector('footer a[href^="/area-privada"]'), petit: document.querySelector('footer .small')?.textContent,
      menu: [...document.querySelectorAll('#nav a')].map((a) => a.getAttribute('href')).join(),
      salta: (() => { const a = document.querySelector('body > a.salta:first-child'); const t = a && document.querySelector(a.getAttribute('href'));
        return !!(a && a.textContent === 'Salta al contingut' && t && t.tagName === 'MAIN' && t.id === 'inici'); })(),
      afegits: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')).join() }));
    comprova(`${f}: el peu ja no té «Àrea privada»`, !p.privada && p.legal.join() === 'Avís legal,Política de privacitat,Política de cookies,Preferències de cookies', JSON.stringify(p.legal));
    comprova(`${f}: text petit del peu nou (associació · correu · Instagram)`, p.petit === 'Web de l’Associació Defensem l’Empordanet · defensemlempordanet@gmail.com · Instagram', p.petit);
    comprova(`${f}: menú nou amb El projecte i Agenda`, p.menu === '/#qui-som,/#el-projecte,/#agenda,/#noticies,/#contacte' || (f === '/' && p.menu === '#qui-som,#el-projecte,#agenda,#noticies,#contacte'), p.menu);
    comprova(`${f}: «Salta al contingut» és el primer element i porta al <main id="inici">`, p.salta);
    comprova(`${f}: afegits.css carrega després de site.css`, /\/css\/site\.css,\/css\/afegits\.css/.test(p.afegits), p.afegits);
    if (f !== '/') {
      // El salt amb teclat: Tab hi arriba primer i Intro mou el focus al contingut.
      await pg.keyboard.press('Tab');
      const primer = await pg.evaluate(() => document.activeElement.textContent);
      await pg.keyboard.press('Enter');
      comprova(`${f}: amb el teclat, «Salta al contingut» és el primer focus i el porta al <main>`, primer === 'Salta al contingut' && (await pg.evaluate(() => document.activeElement.id)) === 'inici', primer);
    }
  }
  const ap = await fetch(ORIGEN + '/area-privada/');
  comprova('l’àrea privada continua funcionant a /area-privada/ (sense enllaç al peu)', ap.status === 200 && /Àrea privada/.test(await ap.text()));
  await pg.goto(ORIGEN + '/noticia.html?id=00000000-0000-0000-0000-000000000000', { waitUntil: 'networkidle' });
  comprova('notícia inexistent: missatge i enllaç', /No hem trobat aquesta publicació/.test(await pg.textContent('main')) && !!(await pg.$('main a[href="/#noticies"]')));

  console.log('\n4. Segur.neteja');
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
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
    return { h1: est('.hero h1'), sub: est('.hero h1 small'), h2: est('#qui-som h2'), h2span: est('#qui-som h2 span'), kicker: est('.kicker'), cos: est('.txt p'), h3: est('.valors h3'),
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
    const sub = r('.hero h1 small'), h1 = r('.hero h1'), lead = r('.hero .lead'), cta = r('.hero .cta'), logo = r('.hero-logo'), mol = r('.molins');
    return { subParagraf: lead.top - sub.bottom, paragrafBotons: cta.top - lead.bottom, botonsMolins: mol.top - cta.bottom, logoParagraf: lead.top - logo.bottom,
      h1Alt: h1.height, logoAlt: logo.height, h1Top: h1.top, logoTop: logo.top, ordreMobil: h1.bottom <= logo.top && logo.bottom <= lead.top && lead.bottom <= cta.top,
      molinsSencers: mol.bottom <= innerHeight };
  });
  if (vp === ESCRIPTORI) {
    comprova(`hero ${nom}: el paràgraf va just sota el subtítol (${e.subParagraf.toFixed(0)} px ≤ 24)`, e.subParagraf >= 8 && e.subParagraf <= 24, JSON.stringify(e));
    comprova(`hero ${nom}: el títol no s’estira a l’alçada del logo i tots dos comencen a dalt`, e.h1Alt < e.logoAlt && Math.abs(e.h1Top - e.logoTop) <= 2, JSON.stringify(e));
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

console.log('\n3d. «El projecte» compacte: dades clau a la vista i la resta a «Més detalls»');
{
  const ESC720 = { width: 1280, height: 720 };
  const mesura = (pg) => pg.evaluate(() => {
    const sec = document.getElementById('el-projecte'), cards = [...sec.querySelectorAll('.projecte')], r = (e) => e.getBoundingClientRect();
    const visible = (e) => !!(e.offsetParent || e.getClientRects().length) && r(e).height > 0;
    return {
      seccio: Math.round(r(sec).height), finsTargetes: Math.round(r(sec.querySelector('.projectes')).bottom - r(sec).top),
      cards: cards.map((c) => ({ h: Math.round(r(c).height), x: Math.round(r(c).left), top: Math.round(r(c).top), det: c.querySelectorAll(':scope > details.mes-detalls').length,
        obert: c.querySelector('details').open, resum: c.querySelector('summary').textContent, titol: c.querySelector('h3').textContent,
        // text a la vista: tot el que no és dins del <details>
        vista: [...c.children].filter((e) => e.tagName !== 'DETAILS').map((e) => e.textContent).join(' ').replace(/\s+/g, ' ') })),
      mides: [...sec.querySelectorAll('.projecte p:not(.fonts), .projecte dd, .projecte summary, .projecte h3')].filter(visible).map((e) => { const cs = getComputedStyle(e); return { fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), t: e.tagName }; }),
      // Les lletres petites que ja hi havia (etiquetes, fonts, peu del dibuix) es mantenen com eren: no s'ha reduït res.
      petites: ['.projecte dt', '.projecte .fonts', '.alcada figcaption'].map((q) => parseFloat(getComputedStyle(sec.querySelector(q)).fontSize)).join(),
      desb: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  {
    const pg = await pagina(ESC720, false);
    await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready);
    const m = await mesura(pg);
    comprova('1280: tres targetes, cadascuna amb un sol «Més detalls», tots tancats', m.cards.length === 3 && m.cards.every((c) => c.det === 1 && !c.obert && c.resum === 'Més detalls'), JSON.stringify(m.cards.map((c) => [c.det, c.obert, c.resum])));
    comprova('a la vista: títol i dades clau (4 molins de 200 m a la Tallada; 5 MW i 200 m a Albons; què és el PLATER)',
      /Quatre aerogeneradors de 200 metres d’alçada al pla de la Tallada/.test(m.cards[0].vista) && /5 MW/.test(m.cards[1].vista) && /200 metres fins a la punta/.test(m.cards[1].vista)
      && /Pla territorial sectorial/.test(m.cards[2].vista), JSON.stringify(m.cards.map((c) => c.vista)));
    comprova('fora de la vista: distàncies, promotor, il·lustració, fulletó i fonts', !m.cards.some((c) => /Can Virosquet|Estabanell|Fonts:|Descarrega el fulletó|segon període/.test(c.vista)));
    const alc = new Set(m.cards.map((c) => c.h));
    comprova(`1280: tancades, les tres targetes fan la mateixa alçada (${[...alc].join(', ')} px)`, alc.size === 1, JSON.stringify(m.cards.map((c) => c.h)));
    comprova(`1280×720: el títol de la secció i les targetes caben en una pantalla (${m.finsTargetes} px) i la secció sencera fa ${m.seccio} px (abans 2.399)`, m.finsTargetes <= 720 && m.seccio <= 1150, JSON.stringify(m));
    comprova('les etiquetes, les fonts i el peu del dibuix mantenen la mida d’abans (no s’ha reduït cap lletra)', m.petites === '12.8,14.4,14.4', m.petites);
    comprova('text de les targetes ≥ 16 px i interlineat ~1,5', m.mides.every((x) => x.fs >= 16) && m.mides.filter((x) => x.t !== 'H3' && x.t !== 'SUMMARY').every((x) => x.lh >= 1.45 && x.lh <= 1.55), JSON.stringify(m.mides));
    // Teclat: el «Més detalls» es troba amb Tab, s'obre amb Intro i es tanca amb Espai.
    await pg.focus('.projecte:nth-child(1) summary');
    await pg.keyboard.press('Tab');
    comprova('Tab salta el contingut tancat i va al «Més detalls» de la targeta següent', await pg.evaluate(() => document.activeElement === document.querySelector('.projecte:nth-child(2) summary')));
    const focus = await pg.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle + ' ' + cs.outlineWidth; });
    comprova('el «Més detalls» enfocat té contorn visible', focus === 'solid 3px', focus);
    await pg.keyboard.press('Enter');
    const obert = await pg.evaluate(() => { const d = document.querySelector('.projecte:nth-child(2) details'), im = d.querySelector('.il-lustracio img');
      return { open: d.open, dist: d.querySelector('dl').offsetParent !== null && /Can Virosquet/.test(d.innerText), pdf: !!d.querySelector('a.doc-link').offsetParent, img: !!im.offsetParent };
    });
    comprova('Intro obre «Més detalls» i el contingut es veu (distàncies, il·lustració, fulletó)', obert.open && obert.dist && obert.pdf && obert.img, JSON.stringify(obert));
    const m2 = await mesura(pg);
    comprova('amb una oberta, les altres no s’estiren (cadascuna torna a la seva alçada)', m2.cards[1].h > m.cards[1].h && m2.cards[0].h <= m.cards[0].h && m2.cards[2].h < m.cards[2].h, JSON.stringify(m2.cards.map((c) => c.h)));
    await pg.keyboard.press('Space');
    comprova('Espai el torna a tancar i el focus es queda al «Més detalls»', await pg.evaluate(() => !document.querySelector('.projecte:nth-child(2) details').open
      && document.activeElement === document.querySelector('.projecte:nth-child(2) summary')));
    await pg.click('.projecte:nth-child(3) summary');
    comprova('amb el ratolí també s’obre, i les fonts (3Cat · Nació Digital) són dins del desplegable', await pg.evaluate(() => { const d = document.querySelector('.projecte:nth-child(3) details');
      return d.open && [...d.querySelectorAll('.fonts a')].map((a) => a.textContent).join() === '3Cat,Nació Digital' && !!d.querySelector('.fonts').offsetParent; }));
    await pg.click('.projecte:nth-child(1) summary');
    const fig = await pg.evaluate(() => { const f = document.querySelector('.projecte:nth-child(1) details figure.alcada'), svg = f.querySelector('svg'), c = f.closest('.projecte'), cs = getComputedStyle(c);
      const util = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { prop: svg.getBoundingClientRect().width / util, rol: svg.getAttribute('role'), titol: document.getElementById(svg.getAttribute('aria-labelledby'))?.textContent,
        peu: f.querySelector('figcaption').textContent, etiquetes: [...svg.querySelectorAll('text')].map((t) => { const b = t.getBBox(); return b.x >= 0 && b.x + b.width <= 330 && b.y >= 0; }) }; });
    comprova(`el dibuix del molí fa ~60% de l’amplada d’abans (${(fig.prop * 100).toFixed(0)}%), amb text alternatiu i peu`, fig.prop > 0.55 && fig.prop < 0.65 && fig.rol === 'img'
      && fig.titol === 'Un aerogenerador de 200 metres comparat amb el Puig Segalar, de 175 metres' && fig.peu === 'Un molí de 200 m és més alt que el Puig Segalar (175 m).', JSON.stringify(fig));
    comprova('les etiquetes del dibuix hi caben senceres', fig.etiquetes.length === 2 && fig.etiquetes.every(Boolean), JSON.stringify(fig.etiquetes));
    comprova('1280: sense errors', pg.errors.length === 0, JSON.stringify(pg.errors));
    if (CAPTURES) await (await pg.$('#el-projecte .projectes')).screenshot({ path: `${CAPTURES}/projecte-obert-1280.png` });
    await pg.context().close();
  }
  {
    const pg = await pagina(MOBIL, false);
    await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready);
    const m = await mesura(pg);
    comprova('390: les targetes s’apilen, compactes (≤ 260 px tancades) i sense scroll horitzontal', new Set(m.cards.map((c) => c.x)).size === 1 && m.cards[0].top < m.cards[1].top && m.cards[1].top < m.cards[2].top
      && m.cards.every((c) => c.h <= 260) && m.desb <= 0, JSON.stringify(m.cards.map((c) => [c.x, c.top, c.h])));
    for (const n of [1, 2, 3]) await pg.click(`.projecte:nth-child(${n}) summary`);
    comprova('390: amb tot obert continua sense scroll horitzontal', (await desbordament(pg)) <= 0);
    if (CAPTURES) await (await pg.$('#el-projecte .projectes')).screenshot({ path: `${CAPTURES}/projecte-390.png` });
    await pg.context().close();
  }
  {
    // El contingut de «Més detalls» és a l'HTML (no el posa cap script) i, sense JavaScript, el desplegable funciona igual.
    const html = await (await fetch(ORIGEN + '/')).text();
    const det = await (async () => { const pg = await pagina(MOBIL, false); await pg.goto(ORIGEN + '/404.html');
      const r = await pg.evaluate((h) => [...new DOMParser().parseFromString(h, 'text/html').querySelectorAll('#el-projecte .projecte > details.mes-detalls')].map((d) => d.textContent.replace(/\s+/g, ' ')), html);
      await pg.context().close(); return r; })();
    comprova('l’HTML porta dins de cada <details> el text amagat', det.length === 3 && /Puig Segalar/.test(det[0]) && /Can Virosquet a uns 510 m/.test(det[1]) && /Estabanell Generació/.test(det[1])
      && /FUE-2025-04857993/.test(det[1]) && /Els gegants d’Albons també hi diuen la seva/.test(det[1]) && /fulletó del molí d’Albons/.test(det[1])
      && /segon període d’informació pública/.test(det[2]) && /Fonts: 3Cat · Nació Digital/.test(det[2]), JSON.stringify(det.map((d) => d.slice(0, 60))));
    const ctx = await nav.newContext({ viewport: MOBIL, javaScriptEnabled: false });
    const pg = await ctx.newPage();
    await pg.goto(ORIGEN + '/');
    await pg.click('.projecte:nth-child(2) summary');
    comprova('sense JavaScript, «Més detalls» s’obre i ensenya el contingut', await pg.evaluate(() => { const d = document.querySelector('.projecte:nth-child(2) details'); return d.open && !!d.querySelector('a.doc-link').offsetParent; }));
    await ctx.close();
  }
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
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
  const pub = BD.publicacions.find((p) => p.estat === 'publicat');
  comprova('mostra només la publicada, amb etiqueta Comunicat', (await pg.$$('#news .card')).length === 1 && (await pg.textContent('#news .etiq')) === 'Comunicat');
  comprova('enllaç «Llegeix-ne més» a /noticia.html?id=', (await pg.getAttribute('#news a.mes', 'href')) === '/noticia.html?id=' + pub.id);
  comprova('«Llegeix-ne més» diu als lectors de pantalla a quina notícia porta', (await pg.getAttribute('#news a.mes', 'aria-label')) === 'Llegeix-ne més: Comunicat publicat'
    && (await pg.textContent('#news a.mes')) === 'Llegeix-ne més');
  comprova('la portada apunta al bucket públic', (await pg.getAttribute('#news .card img', 'src') || '').startsWith(SB + '/storage/v1/object/public/portades/' + U.E));
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

console.log('\n6b. Instagram: l’oficial al peu i el configurat a Contacte (390 px i 1280 px)');
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const ruta of ['/', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html?id=no-valid']) {
    const pg = await pagina(vp, false);
    await pg.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: CONFIG_IG }));
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    const peu = await pg.$eval('footer', (f) => ({ ig: [...f.querySelectorAll('a[href*="instagram"]')].map((a) => [a.href, a.target, a.rel].join()),
      dinamic: f.querySelectorAll('.ig, #ig-peu').length, buits: [...f.querySelectorAll('.w > *')].filter((e) => !e.textContent.trim() && !e.children.length).length }));
    comprova(`${ruta} @${vp.width}px: el peu té un sol enllaç, a l’Instagram oficial i en pestanya nova, i cap element buit`,
      peu.ig.join('|') === 'https://www.instagram.com/defensemlempordanet/,_blank,noopener noreferrer' && peu.dinamic === 0 && peu.buits === 0, JSON.stringify(peu));
    comprova(`${ruta} @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    if (ruta === '/') {
      const c = await pg.$eval('#ig-contacte', (li) => ({ visible: !li.hidden, n: li.querySelectorAll('a.ig').length, href: li.querySelector('a.ig')?.href, text: li.textContent }));
      comprova(`/ @${vp.width}px: Instagram es manté a Contacte`, c.visible && c.n === 1 && c.href === IG && /Segueix-nos a Instagram/.test(c.text), JSON.stringify(c));
      comprova(`/ @${vp.width}px: tots els enllaços d’Instagram s’obren en una pestanya nova amb noopener`,
        await pg.$$eval('a[href*="instagram"]', (l) => l.length > 1 && l.every((a) => a.target === '_blank' && /noopener/.test(a.rel))));
      if (CAPTURES) {
        const clip = await pg.evaluate(() => {
          const a = document.getElementById('contacte').getBoundingClientRect(), b = document.querySelector('footer').getBoundingClientRect();
          return { x: 0, y: a.top + scrollY, width: document.documentElement.clientWidth, height: b.bottom - a.top };
        });
        await pg.screenshot({ path: `${CAPTURES}/peu-${vp.width}.png`, fullPage: true, clip });
      }
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
  'editor@ex.cat': ['Inici', 'Nova publicació', 'Les meves publicacions', 'Revisió', 'Totes les publicacions', 'Documents'],
  'admin@ex.cat': ['Inici', 'Nova publicació', 'Les meves publicacions', 'Revisió', 'Totes les publicacions', 'Documents', 'Usuaris'],
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
  const rutes = PAGINES.map((r) => [r, false]).concat([['/area-privada/panel.html (amb sessió)', true]]);
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
        e.fosc && e.fons === 'rgb(241, 240, 238)' && /only/.test(e.esquema) && /light/.test(e.esquema) && !/dark/.test(e.esquema) && e.meta === 'only light' && e.meta2 === 'light', JSON.stringify(e));
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
  const obert = await pg.evaluate(() => ({ exp: document.getElementById('mb').getAttribute('aria-expanded'), visibles: [...document.querySelectorAll('#nav a')].filter((a) => a.offsetParent).length,
    dins: [...document.querySelectorAll('#nav a')].every((a) => a.getBoundingClientRect().right <= innerWidth) }));
  comprova(`${ruta}: el botó Menú obre els 5 enllaços, sense sortir per la dreta`, tancat.boto && !tancat.nav && obert.exp === 'true' && obert.visibles === 5 && obert.dins && (await desbordament(pg)) <= 0, JSON.stringify({ tancat, obert }));
  await pg.keyboard.press('Escape');
  comprova(`${ruta}: Escape el tanca`, (await pg.getAttribute('#mb', 'aria-expanded')) === 'false');
  if (ruta === '/') {
    await pg.click('#mb'); await pg.click('#nav a[href="/#agenda"]');
    comprova('/: triar «Agenda» tanca el menú i porta a la secció', (await pg.getAttribute('#mb', 'aria-expanded')) === 'false' && (await pg.evaluate(() => location.hash)) === '#agenda');
  }
  await pg.context().close();
}

console.log('\n12. Fitxers nous, icones i capçaleres de seguretat');
{
  for (const [ruta, tipus] of [['/css/afegits.css', 'text/css'], ['/js/agenda.js', 'text/javascript'], ['/img/og-defensem.jpg', 'image/jpeg'],
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
  comprova('sitemap.xml inclou la portada', sitemap.includes('<loc>https://defensem.vercel.app/</loc>'));

  const ICONES = ['link[rel=icon][href="/favicon.ico"][sizes="48x48"]', 'link[rel=icon][href="/img/icona-32.png"][type="image/png"][sizes="32x32"]',
    'link[rel=apple-touch-icon][href="/img/apple-touch-icon.png"]', 'link[rel=manifest][href="/site.webmanifest"]', 'meta[name=theme-color][content="#da1415"]'];
  for (const ruta of [...PAGINES, '/404.html']) {
    const pg = await pagina(MOBIL, false);
    await pg.goto(ORIGEN + ruta);
    const falten = await pg.evaluate((l) => l.filter((s) => !document.head.querySelector(s)), ICONES);
    comprova(`${ruta}: les cinc línies d’icones a <head>`, falten.length === 0, falten.join(' '));
    if (!ruta.startsWith('/area-privada')) {
      const og = await pg.evaluate(() => [document.querySelector('meta[property="og:image"]')?.content, document.querySelector('meta[name="twitter:card"]')?.content].join());
      comprova(`${ruta}: imatge per compartir (og:image i twitter:card)`, og === 'https://defensem.vercel.app/img/og-defensem.jpg,summary_large_image', og);
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
    comprova('la portada continua forçant l’esquema clar', m.color === 'only light');
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
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
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
  await pg.route('**/js/agenda.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
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
// Posició a la pantalla d'un molí (inversa de aLogica a joc.js: H = 1200; en estret la vista va de 150 a 1290).
const aPantalla = (pg, l) => pg.$eval('.fm-tela', (c, l) => { const r = c.getBoundingClientRect(), e = c.closest('.fm-escenari').classList.contains('fm-estret');
  const x0 = e ? 150 : 0, x1 = e ? 1290 : 1440; return { x: r.left + (l.x - x0) / (x1 - x0) * r.width, y: r.top + (l.y - 40 * l.s) / 1200 * r.height, k: c.width / (x1 - x0), x0 }; }, l);
const espera = (pg, fn, arg, ms = 8000) => pg.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
for (const vp of [MOBIL, ESCRIPTORI]) {
  const nom = `@${vp.width}px`;
  const pg = await pagina(vp, false);
  await pg.addInitScript(espiaMans);
  const recursos = [];
  // Només el logo de la pantalla final (90 kB) es baixa d'entrada: joc.js li posa el src en arrencar.
  pg.on('request', (r) => { if (/\/fora-molins\/(assets|sons)\//.test(r.url()) && !/\/assets\/logo\.webp/.test(r.url())) recursos.push(r.url()); });
  await pg.goto(ORIGEN + '/?debug', { waitUntil: 'networkidle' });
  comprova(`joc ${nom}: els gràfics i sons (tret del logo final) no es baixen fins que t’hi acostes`, recursos.length === 0 && (await pg.textContent('[data-juga]')) === 'Carregant…', recursos.slice(0, 3).join());
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
  comprova(`joc ${nom}: i el botó «Fes-te’n soci o sòcia» al formulari, en pestanya nova`, fi.text === 'Fes-te’n soci o sòcia' && fi.target === '_blank' && /noopener/.test(fi.rel)
    && fi.href === 'https://docs.google.com/forms/d/e/1FAIpQLSf6IsYYaV5FMGA-Qw-Khk-ff-6PxW5JrYaxLETymXJ7eg7CJg/viewform' && fi.label.startsWith('Fes-te’n soci o sòcia'), JSON.stringify(fi));
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
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
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
  await pg.goto(ORIGEN + '/', { waitUntil: 'networkidle' });
  await pg.$eval('#joc', (e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  comprova('joc: sense manifest, el botó diu «Torna-ho a provar»', await espera(pg, () => document.querySelector('[data-juga]').textContent === 'Torna-ho a provar'));
  await pg.context().close();
}

await nav.close();
servidor.close();
console.log(`\n${ok} correctes, ${ko} fallades.`);
process.exit(ko ? 1 : 0);
