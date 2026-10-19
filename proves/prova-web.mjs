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
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const servidor = http.createServer(async (req, res) => {
  let cami = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (cami.includes('..')) { res.writeHead(400); return res.end(); }
  let f = join(ARREL, cami);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); const c = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(c);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); }
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
const nav = await chromium.launch();
const MOBIL = { width: 390, height: 844 }, ESCRIPTORI = { width: 1280, height: 900 };
async function pagina(viewport, ambSupabase, opcions) {
  const ctx = await nav.newContext({ viewport, ...(opcions || {}) });
  const pg = await ctx.newPage();
  pg.errors = []; pg.externes = []; pg.dialegs = [];
  pg.on('console', (m) => { if (m.type() === 'error') pg.errors.push(m.text()); });
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
      pg.errors.length === 0 && d <= 0 && pg.externes.length === 0, JSON.stringify({ errors: pg.errors, d, ext: pg.externes }));
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
  comprova('seccions Qui som, Notícies i Contacte', (await pg.$$('#qui-som, #noticies, #contacte')).length === 3);
  comprova('il·lustració de molins i plaques (sense el SVG antic)', !!(await pg.$('.hero .molins')) && !(await pg.$('svg.paisatge, .rot')));
  await pg.$eval('.foto img', (i) => i.scrollIntoView()); await pg.waitForTimeout(400);
  comprova('la foto carrega', await pg.$eval('.foto img', (i) => i.complete && i.naturalWidth > 0));
  comprova('correu de contacte', !!(await pg.$('a[href="mailto:defensemlempordanet@gmail.com"]')));
  comprova('Instagram ocult sense URL', await pg.$eval('#ig-contacte', (e) => e.hidden) && !(await pg.$('.ig')));
  comprova('botó «Signa la petició» desactivat', await pg.$eval('.cta button', (b) => b.disabled && /Signa la petició/.test(b.textContent)));
  comprova('notícies buides amb el missatge', /Encara no hi ha notícies publicades/.test(await pg.$eval('#news', (e) => e.textContent)));
  comprova('enllaç «Àrea privada» al peu', (await textos(pg, 'footer .legal a')).includes('Àrea privada'));
  comprova('cap cookie ni localStorage', (await pg.context().cookies()).length === 0 && (await pg.evaluate(() => localStorage.length)) === 0);
  for (const f of ['/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html']) {
    await pg.goto(ORIGEN + f);
    comprova('enllaç «Àrea privada» al peu de ' + f, (await textos(pg, 'footer .legal a')).includes('Àrea privada'));
  }
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
  await pg.context().close();
}
{
  const pg = await pagina(ESCRIPTORI, true);
  await pg.goto(ORIGEN + '/area-privada/', { waitUntil: 'networkidle' });
  const h1 = await pg.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  comprova('l’àrea privada no canvia de tipografia (Open Sans)', /^"?Open Sans/.test(h1), h1);
  await pg.context().close();
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
  comprova('la portada apunta al bucket públic', (await pg.getAttribute('#news .card img', 'src') || '').startsWith(SB + '/storage/v1/object/public/portades/' + U.E));
  const q = peticions.find((x) => x.url.startsWith('/rest/v1/publicacions_publiques'));
  comprova('consulta la vista pública (mai la taula)', !!q && !peticions.some((x) => x.url.startsWith('/rest/v1/publicacions?')));
  await pg.goto(ORIGEN + '/noticia.html?id=' + pub.id, { waitUntil: 'networkidle' });
  comprova('pàgina de notícia amb títol', (await pg.textContent('main h1')) === 'Comunicat publicat');
  const html = await pg.$eval('.contingut', (e) => e.innerHTML);
  comprova('el contingut públic arriba net (sense script/onerror/javascript:/style)', !/script|onerror|javascript:|style=|onclick/i.test(html) && html.includes('<strong>important</strong>'));
  comprova('cap codi injectat s’executa a la pàgina pública', (await pg.evaluate(() => window.__xss)) === undefined);
  comprova('sense desbordament ni errors (notícia, mòbil)', (await desbordament(pg)) <= 0 && pg.errors.filter((e) => !/storage\/v1/.test(e)).length === 0, JSON.stringify(pg.errors));
  await pg.context().close();
}

console.log('\n6b. Instagram només a Contacte, no al peu (390 px i 1280 px)');
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const ruta of ['/', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html', '/noticia.html?id=no-valid']) {
    const pg = await pagina(vp, false);
    await pg.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: CONFIG_IG }));
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' });
    const peu = await pg.$eval('footer', (f) => ({ ig: f.querySelectorAll('.ig, #ig-peu, a[href*="instagram"]').length, text: /Instagram/i.test(f.textContent),
      buits: [...f.querySelectorAll('.w > *')].filter((e) => !e.textContent.trim() && !e.children.length).length }));
    comprova(`${ruta} @${vp.width}px: el peu no té Instagram ni elements buits`, peu.ig === 0 && !peu.text && peu.buits === 0, JSON.stringify(peu));
    comprova(`${ruta} @${vp.width}px: sense desbordament ni errors`, (await desbordament(pg)) <= 0 && pg.errors.length === 0, JSON.stringify(pg.errors));
    if (ruta === '/') {
      const c = await pg.$eval('#ig-contacte', (li) => ({ visible: !li.hidden, n: li.querySelectorAll('a.ig').length, href: li.querySelector('a.ig')?.href, text: li.textContent }));
      comprova(`/ @${vp.width}px: Instagram es manté a Contacte`, c.visible && c.n === 1 && c.href === IG && /Segueix-nos a Instagram/.test(c.text), JSON.stringify(c));
      comprova(`/ @${vp.width}px: un sol enllaç d’Instagram a tota la pàgina`, (await pg.$$('a[href*="instagram"]')).length === 1);
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

await nav.close();
servidor.close();
console.log(`\n${ok} correctes, ${ko} fallades.`);
process.exit(ko ? 1 : 0);
