// Prova del bàner i el panell de consentiment de cookies (public/js/consentiment.js) amb un navegador real.
// Ara la web només fa servir tecnologies necessàries: HI_HA_OPCIONALS = false i el bàner no surt sol.
// Les proves del bàner es fan amb HI_HA_OPCIONALS = true (servint el fitxer amb aquest canvi), com el dia que s'afegeixi un script opcional.
// Ús: npm i --no-save playwright && npx playwright install chromium && node proves/prova-cookies.mjs
//     CAPTURES=carpeta node proves/prova-cookies.mjs   → desa també captures a 390 i 1280 px.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ARREL = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
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

const JS = await readFile(join(ARREL, 'js/consentiment.js'), 'utf8');
const CLAU = JS.match(/var CLAU = '([^']+)'/)[1], VERSIO = JS.match(/var VERSIO = '([^']+)'/)[1];
const AMB_OPCIONALS = JS.replace('var HI_HA_OPCIONALS = false;', 'var HI_HA_OPCIONALS = true;');
if (AMB_OPCIONALS === JS) throw new Error('No trobo «var HI_HA_OPCIONALS = false;» a consentiment.js');
const CONFIG_BUIT = 'window.DEFENSEM = { instagram: "", supabaseUrl: "", supabaseAnonKey: "" };';
const CAPTURES = process.env.CAPTURES || '';
const PAGINES = ['/', '/noticia.html', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/preferencies-cookies.html'];
const MOBIL = { width: 390, height: 844 }, ESCRIPTORI = { width: 1280, height: 900 };

const nav = await chromium.launch();
async function pagina(viewport, opcions) {
  const { opcionals, ...resta } = opcions || {};
  const ctx = await nav.newContext({ viewport, ...resta });
  const pg = await ctx.newPage();
  pg.errors = []; pg.externes = [];
  pg.on('console', (m) => { if (m.type() === 'error') pg.errors.push(m.text()); });
  pg.on('pageerror', (e) => pg.errors.push(e.message));
  pg.on('request', (r) => { if (!r.url().startsWith(ORIGEN) && !r.url().startsWith('data:')) pg.externes.push(r.url()); });
  await pg.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: CONFIG_BUIT }));
  if (opcionals) await pg.route('**/js/consentiment.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: AMB_OPCIONALS }));
  return pg;
}
const desbordament = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const desat = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLAU);
const hiHaBanner = (pg) => pg.evaluate(() => !!document.querySelector('.cc-banner'));
const panellObert = (pg) => pg.evaluate(() => { const d = document.querySelector('.cc-panell'); return !!(d && d.open); });
const focusAlPanell = (pg) => pg.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.cc-panell'));
// Escolta l'esdeveniment abans d'actuar.
const escolta = (pg) => pg.evaluate(() => { window.__ev = []; document.addEventListener('consentiment:canvi', (e) => window.__ev.push(e.detail)); });
// Espera que acabin les animacions d'entrada del bàner i del panell (els molins giren sempre: no compten).
const quiet = (pg) => pg.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest('.cc-banner, .cc-panell')).map((a) => a.finished)));
const esdeveniments = (pg) => pg.evaluate(() => window.__ev);
function contrast(a, b) {
  const L = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05);
}

// ---------- 0. Per defecte (només tecnologies necessàries) no surt cap bàner ----------
console.log('\nSense opcionals: cap bàner automàtic');
comprova('consentiment.js porta HI_HA_OPCIONALS = false', /var HI_HA_OPCIONALS = false;/.test(JS) && /if \(!llegeix\(\) && HI_HA_OPCIONALS\) mostraBanner\(\);/.test(JS));
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const ruta of PAGINES) {
    const pg = await pagina(vp);
    await pg.goto(ORIGEN + ruta, { waitUntil: 'networkidle' }); await pg.waitForTimeout(200);
    const t = `${ruta} ${vp.width}px`;
    comprova(`${t}: primera visita (pestanya privada nova) sense bàner ni espai reservat`, !(await hiHaBanner(pg)) && (await pg.evaluate(() => getComputedStyle(document.body).paddingBottom)) === '0px');
    comprova(`${t}: no es desa res, cap cookie ni petició externa, sense errors`, (await desat(pg)) === null && (await pg.context().cookies()).length === 0
      && pg.externes.length === 0 && pg.errors.length === 0, JSON.stringify({ e: pg.errors, x: pg.externes }));
    comprova(`${t}: l'API respon igual (no decidit, analítiques desactivades)`, (await pg.evaluate(() => [consentiment.decidit(), consentiment.te('analitiques'), consentiment.te('necessaries')].join())) === 'false,false,true');
    await pg.context().close();
  }
}
{
  const pg = await pagina(MOBIL);
  await pg.goto(ORIGEN + '/'); await pg.waitForLoadState('networkidle');
  await pg.keyboard.press('Tab');
  comprova('sense bàner, el primer Tab va a «Salta al contingut»', (await pg.evaluate(() => document.activeElement.textContent)) === 'Salta al contingut');
  if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/sense-banner-390.png` });
  await pg.context().close();
}

// ---------- 1. Amb opcionals, el bàner surt la primera vegada a totes les pàgines públiques ----------
console.log('\nBàner (amb HI_HA_OPCIONALS = true): primera visita');
for (const vp of [MOBIL, ESCRIPTORI]) {
  for (const ruta of PAGINES) {
    const pg = await pagina(vp, { opcionals: true });
    await pg.goto(ORIGEN + ruta);
    await pg.waitForSelector('.cc-banner');
    const b = await pg.$eval('.cc-banner', (e) => ({ rol: e.getAttribute('role'), modal: e.getAttribute('aria-modal'),
      titol: document.getElementById(e.getAttribute('aria-labelledby')).textContent, text: document.getElementById(e.getAttribute('aria-describedby')).textContent,
      alt: e.getBoundingClientRect().height, botons: [...e.querySelectorAll('.cc-botons button')].map((x) => x.textContent) }));
    const t = `${ruta} ${vp.width}px`;
    comprova(`${t}: bàner role=dialog no modal amb títol`, b.rol === 'dialog' && b.modal === 'false' && b.titol === 'Cookies', JSON.stringify(b));
    comprova(`${t}: text i botons Rebutjar / Configurar / Acceptar`, b.text.startsWith('Aquest web només fa servir tecnologies estrictament necessàries.') && b.botons.join() === 'Rebutjar,Configurar,Acceptar', b.botons.join());
    comprova(`${t}: sense desbordament horitzontal`, (await desbordament(pg)) <= 0);
    comprova(`${t}: el bàner ocupa ≤ 35% de la pantalla (${Math.round(b.alt / vp.height * 100)}%)`, b.alt <= vp.height * 0.35);
    comprova(`${t}: sense cookies ni peticions externes`, (await pg.context().cookies()).length === 0 && pg.externes.length === 0, pg.externes.join());
    comprova(`${t}: no es desa res fins que es tria`, (await desat(pg)) === null);
    comprova(`${t}: sense errors`, pg.errors.length === 0, pg.errors.join(' | '));
    if (ruta === '/') {
      // Mateix pes visual: estil calculat idèntic i mateixa mida.
      const e = await pg.$$eval('.cc-botons button', (l) => l.map((x) => { const s = getComputedStyle(x), r = x.getBoundingClientRect();
        return { estil: [s.backgroundColor, s.color, s.borderTopColor, s.borderTopWidth, s.fontWeight, s.fontSize, s.textTransform].join(), w: Math.round(r.width), h: Math.round(r.height) }; }));
      comprova(`${t}: els 3 botons tenen el mateix estil`, new Set(e.map((x) => x.estil)).size === 1, JSON.stringify(e));
      comprova(`${t}: els 3 botons tenen la mateixa mida`, new Set(e.map((x) => x.w + 'x' + x.h)).size === 1, JSON.stringify(e));
      comprova(`${t}: botons ≥ 44 px d'alt i d'ample`, e.every((x) => x.h >= 44 && x.w >= 44));
      const c = await pg.evaluate(() => { const s = (q, p) => getComputedStyle(document.querySelector(q))[p];
        return { fons: s('.cc-banner', 'backgroundColor'), text: s('.cc-banner p', 'color'), enllac: s('.cc-banner a', 'color'), titol: s('.cc-titol', 'color'),
          titolFont: s('.cc-titol', 'fontFamily'), titolMida: parseFloat(s('.cc-titol', 'fontSize')), btnFons: s('.cc-btn', 'backgroundColor'), btn: s('.cc-btn', 'color'), font: s('.cc-banner p', 'fontFamily') }; });
      comprova(`${t}: fons oficial #f1f0ee, Open Sans i títol en Anton`, c.fons === 'rgb(241, 240, 238)' && c.font.startsWith('"Open Sans"') && c.titolFont.startsWith('Anton'), JSON.stringify(c));
      comprova(`${t}: contrast AA (text ${contrast(c.text, c.fons).toFixed(1)}, enllaç ${contrast(c.enllac, c.fons).toFixed(1)}, botó ${contrast(c.btn, c.btnFons).toFixed(1)}, títol gran ${contrast(c.titol, c.fons).toFixed(1)})`,
        contrast(c.text, c.fons) >= 4.5 && contrast(c.enllac, c.fons) >= 4.5 && contrast(c.btn, c.btnFons) >= 4.5 && c.titolMida >= 18.66 && contrast(c.titol, c.fons) >= 3);
      // No tapa res: cada enllaç o botó de la pàgina, en rebre el focus, queda per sobre del bàner.
      const tapats = await pg.evaluate(() => {
        const dalt = document.querySelector('.cc-banner').getBoundingClientRect().top, res = [];
        document.querySelectorAll('main a[href], main button, footer a[href]').forEach((el) => {
          if (!el.offsetParent) return;
          // Dins d'un <details> tancat (preguntes, actes anteriors) no és visible ni rep el focus fins que s'obre.
          const det = el.closest('details'); if (det && !det.open && !el.closest('summary')) return;
          // Com el desplaçament real en rebre el focus (respecta scroll-padding), però sense l'animació smooth.
          el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const r = el.getBoundingClientRect();
          if (r.bottom > dalt + 1) res.push((el.textContent || '').trim().slice(0, 30) + ' ' + Math.round(r.bottom) + '>' + Math.round(dalt));
        });
        document.activeElement.blur(); return res;
      });
      comprova(`${t}: el bàner no tapa cap enllaç ni botó en rebre el focus`, tapats.length === 0, tapats.join(' | '));
      const peu = await pg.evaluate(() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        const l = [...document.querySelectorAll('.legal a')].pop().getBoundingClientRect(); return l.bottom <= document.querySelector('.cc-banner').getBoundingClientRect().top; });
      comprova(`${t}: amb tot desplaçat, el darrer enllaç del peu queda visible sobre el bàner`, peu);
      await quiet(pg);
      const hero = await pg.evaluate(() => { const dalt = document.querySelector('.cc-banner').getBoundingClientRect().top;
        return { dalt: Math.round(dalt), botons: [...document.querySelectorAll('.hero .cta > *')].map((e) => Math.round(e.getBoundingClientRect().bottom)) }; });
      comprova(`${t}: sense desplaçar, els botons del hero queden per sobre del bàner`, hero.botons.every((x) => x <= hero.dalt), JSON.stringify(hero));
      const retall = await pg.$$eval('.cc-btn', (l) => l.filter((x) => x.scrollWidth > x.clientWidth).length);
      comprova(`${t}: el text dels botons hi cap`, retall === 0);
      if (CAPTURES) { await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await quiet(pg); await pg.screenshot({ path: `${CAPTURES}/banner-${vp.width}.png` }); }
    }
    await pg.context().close();
  }
}

// ---------- 2. Rebutjar ----------
console.log('\nRebutjar');
{
  const pg = await pagina(MOBIL, { opcionals: true });
  await pg.goto(ORIGEN + '/'); await pg.waitForSelector('.cc-banner'); await escolta(pg);
  await pg.click('.cc-banner [data-cc=rebutjar]');
  const d = await desat(pg), ev = await esdeveniments(pg);
  comprova('desa versió, data i analítiques rebutjades', d && d.versio === VERSIO && !isNaN(Date.parse(d.data)) && d.categories.analitiques === false, JSON.stringify(d));
  comprova('el bàner desapareix i no deixa espai reservat', !(await hiHaBanner(pg)) && (await pg.evaluate(() => getComputedStyle(document.body).paddingBottom)) === '0px');
  comprova('esdeveniment consentiment:canvi amb analitiques=false', ev.length === 1 && ev[0].categories.analitiques === false && ev[0].categories.necessaries === true && ev[0].versio === VERSIO, JSON.stringify(ev));
  comprova("consentiment.te('analitiques') === false; te('necessaries') === true", (await pg.evaluate(() => [consentiment.te('analitiques'), consentiment.te('necessaries')].join())) === 'false,true');
  comprova('avís per a lectors de pantalla', (await pg.waitForFunction(() => { const s = document.querySelector('.cc-sr[role=status]'); return s && s.textContent.includes('desat'); }).then(() => true, () => false)));
  for (const ruta of ['/', '/avis-legal.html', '/cookies.html']) {
    await pg.goto(ORIGEN + ruta); await pg.waitForLoadState('load');
    comprova(`no torna a sortir a ${ruta}`, !(await hiHaBanner(pg)));
  }
  comprova('Rebutjar: cap cookie', (await pg.context().cookies()).length === 0);
  await pg.context().close();
}

// ---------- 3. Acceptar ----------
console.log('\nAcceptar');
{
  const pg = await pagina(ESCRIPTORI, { opcionals: true });
  await pg.goto(ORIGEN + '/privacitat.html'); await pg.waitForSelector('.cc-banner'); await escolta(pg);
  await pg.click('.cc-banner [data-cc=acceptar]');
  const d = await desat(pg), ev = await esdeveniments(pg);
  comprova('desa analítiques acceptades', d && d.versio === VERSIO && d.categories.analitiques === true, JSON.stringify(d));
  comprova('esdeveniment amb analitiques=true', ev.length === 1 && ev[0].categories.analitiques === true);
  comprova("consentiment.te('analitiques') === true", await pg.evaluate(() => consentiment.te('analitiques')));
  comprova('no es carrega cap script opcional ni extern', pg.externes.length === 0 && (await pg.$$eval('script', (l) => l.map((s) => s.src).filter((s) => s && !s.includes('/js/')).length)) === 0, pg.externes.join());
  await pg.reload(); await pg.waitForLoadState('load');
  comprova('no torna a sortir en recarregar', !(await hiHaBanner(pg)));
  await pg.context().close();
}

// ---------- 4. Configurar (amb teclat) ----------
console.log('\nConfigurar amb teclat');
for (const vp of [MOBIL, ESCRIPTORI]) {
  const pg = await pagina(vp, { opcionals: true });
  await pg.goto(ORIGEN + '/'); await pg.waitForSelector('.cc-banner'); await escolta(pg);
  // El bàner és el primer del recorregut amb tabulador: «Més informació», Rebutjar, Configurar.
  const recorregut = [];
  for (let i = 0; i < 3; i++) { await pg.keyboard.press('Tab'); recorregut.push(await pg.evaluate(() => document.activeElement.textContent.trim())); }
  comprova(`${vp.width}px: Tab arriba al bàner primer (${recorregut.join(' → ')})`, recorregut.join() === 'Més informació,Rebutjar,Configurar');
  const vora = await pg.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  comprova(`${vp.width}px: focus visible al botó`, vora);
  await pg.keyboard.press('Enter');
  comprova(`${vp.width}px: Configurar obre el panell (diàleg modal)`, await panellObert(pg));
  const p = await pg.$eval('.cc-panell', (d) => ({ titol: document.getElementById(d.getAttribute('aria-labelledby')).textContent, focus: document.activeElement.id,
    nec: d.querySelector('[aria-labelledby=cc-nec-t]').outerHTML, an: d.querySelector('#cc-analitiques').getAttribute('aria-checked'),
    tactils: [...d.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }) }));
  comprova(`${vp.width}px: títol accessible i focus al títol del panell`, p.titol === 'Preferències de cookies' && p.focus === 'cc-p-titol', JSON.stringify(p));
  comprova(`${vp.width}px: Necessàries sempre actives i no desactivables`, p.nec.includes('role="switch"') && p.nec.includes('aria-checked="true"') && p.nec.includes('aria-disabled="true"'));
  comprova(`${vp.width}px: Analítiques desactivades per defecte`, p.an === 'false');
  comprova(`${vp.width}px: àrees tàctils del panell ≥ 44 px`, p.tactils.every((x) => x >= 44), p.tactils.join());
  comprova(`${vp.width}px: panell sense desbordament`, (await desbordament(pg)) <= 0);
  // Focus atrapat: 12 Tab i 12 Maj+Tab sense sortir del panell.
  let fora = 0;
  for (let i = 0; i < 12; i++) { await pg.keyboard.press('Tab'); if (!(await focusAlPanell(pg))) fora++; }
  for (let i = 0; i < 12; i++) { await pg.keyboard.press('Shift+Tab'); if (!(await focusAlPanell(pg))) fora++; }
  comprova(`${vp.width}px: el focus queda atrapat dins el panell`, fora === 0, fora + ' cops fora');
  // Un clic a Necessàries no la desactiva.
  await pg.click('[aria-labelledby=cc-nec-t]', { force: true });
  comprova(`${vp.width}px: clicar Necessàries no la desactiva`, (await pg.getAttribute('[aria-labelledby=cc-nec-t]', 'aria-checked')) === 'true');
  // Escape tanca sense desar i torna el focus a Configurar.
  await pg.keyboard.press('Escape');
  comprova(`${vp.width}px: Escape tanca el panell i torna el focus a Configurar`, !(await panellObert(pg)) && (await pg.evaluate(() => document.activeElement.dataset.cc)) === 'configurar');
  comprova(`${vp.width}px: tancar sense desar no desa res i el bàner continua`, (await desat(pg)) === null && (await hiHaBanner(pg)));
  // Torna a obrir, activa l'interruptor amb l'espai i desa amb Intro.
  await pg.keyboard.press('Enter');
  await pg.focus('#cc-analitiques'); await pg.keyboard.press('Space');
  comprova(`${vp.width}px: l'interruptor canvia amb l'espai`, (await pg.getAttribute('#cc-analitiques', 'aria-checked')) === 'true');
  await quiet(pg);
  comprova(`${vp.width}px: amb el panell obert, el bàner queda sota el fons modal`, await pg.evaluate(() => { const r = document.querySelector('.cc-banner [data-cc=acceptar]').getBoundingClientRect();
    return !document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('.cc-banner'); }));
  if (CAPTURES) await pg.screenshot({ path: `${CAPTURES}/panell-${vp.width}.png` });
  await pg.focus('[data-cc=desar]'); await pg.keyboard.press('Enter');
  const d = await desat(pg);
  comprova(`${vp.width}px: «Desar preferències» desa la tria`, d && d.categories.analitiques === true && d.versio === VERSIO, JSON.stringify(d));
  comprova(`${vp.width}px: es tanquen panell i bàner`, !(await panellObert(pg)) && !(await hiHaBanner(pg)));
  comprova(`${vp.width}px: un sol esdeveniment de canvi`, (await esdeveniments(pg)).length === 1);
  await pg.reload(); await pg.waitForLoadState('load');
  comprova(`${vp.width}px: no torna a sortir`, !(await hiHaBanner(pg)));
  comprova(`${vp.width}px: sense errors`, pg.errors.length === 0, pg.errors.join(' | '));
  await pg.context().close();
}

// ---------- 5. Enllaç del peu i pàgina de preferències ----------
console.log('\nEnllaç «Preferències de cookies»');
for (const ruta of ['/', '/avis-legal.html', '/privacitat.html', '/cookies.html', '/noticia.html']) {
  const pg = await pagina(MOBIL);
  await pg.goto(ORIGEN + ruta); await pg.waitForLoadState('load');
  await escolta(pg);
  await pg.click('footer a[href="/preferencies-cookies.html"]');
  comprova(`${ruta}: sense bàner, l'enllaç del peu obre el panell sense canviar de pàgina`, !(await hiHaBanner(pg)) && (await panellObert(pg)) && new URL(pg.url()).pathname === ruta);
  comprova(`${ruta}: el panell parteix d'analítiques desactivades`, (await pg.getAttribute('#cc-analitiques', 'aria-checked')) === 'false');
  await pg.click('#cc-analitiques'); await pg.click('[data-cc=desar]');
  const d = await desat(pg);
  comprova(`${ruta}: canviar la decisió des del peu actualitza la clau`, d.categories.analitiques === true && (await esdeveniments(pg)).length === 1);
  comprova(`${ruta}: el focus torna a l'enllaç del peu`, (await pg.evaluate(() => document.activeElement.getAttribute('href'))) === '/preferencies-cookies.html');
  await pg.context().close();
}
{
  const pg = await pagina(MOBIL);
  await pg.goto(ORIGEN + '/preferencies-cookies.html'); await pg.waitForLoadState('load');
  comprova('pàgina de preferències: sense bàner', !(await hiHaBanner(pg)));
  comprova('pàgina de preferències: estat «encara no has triat»', (await pg.textContent('#cc-estat')).includes('Encara no has triat'));
  await pg.click('main [data-cc=obre]');
  comprova('pàgina de preferències: el botó obre el mateix panell', await panellObert(pg));
  await pg.click('#cc-analitiques'); await pg.click('[data-cc=desar]');
  comprova("pàgina de preferències: l'estat s'actualitza en desar", (await pg.textContent('#cc-estat')).includes('acceptades') && !(await hiHaBanner(pg)));
  await pg.reload(); await pg.waitForLoadState('load');
  comprova('pàgina de preferències: llegeix la mateixa clau en recarregar', (await pg.textContent('#cc-estat')).includes('acceptades'));
  // Ctrl+clic a l'enllaç del peu manté el comportament normal del navegador (no obre el panell).
  await pg.click('footer a[href="/preferencies-cookies.html"]', { modifiers: ['Control'] }).catch(() => {});
  comprova('Ctrl+clic a l\'enllaç no obre el panell', !(await panellObert(pg)));
  await pg.context().close();
}

// ---------- 6. Canvi de versió ----------
console.log('\nVersió');
{
  const pg = await pagina(MOBIL, { opcionals: true });
  await pg.addInitScript((k) => { if (!sessionStorage.getItem('fet')) { sessionStorage.setItem('fet', 1);
    localStorage.setItem(k, JSON.stringify({ versio: '0-antiga', data: '2020-01-01T00:00:00.000Z', categories: { analitiques: true } })); } }, CLAU);
  await pg.goto(ORIGEN + '/');
  comprova('amb una versió antiga desada, el bàner torna a sortir', await pg.waitForSelector('.cc-banner').then(() => true, () => false));
  comprova("amb una versió antiga, te('analitiques') és false", (await pg.evaluate(() => consentiment.te('analitiques'))) === false);
  await pg.context().close();
}

// ---------- 7. Moviment reduït ----------
{
  const pg = await pagina(MOBIL, { reducedMotion: 'reduce', opcionals: true });
  await pg.goto(ORIGEN + '/'); await pg.waitForSelector('.cc-banner');
  comprova('prefers-reduced-motion: el bàner apareix sense animació', (await pg.$eval('.cc-banner', (e) => getComputedStyle(e).animationName)) === 'none');
  await pg.context().close();
}

// ---------- 8. Àrea privada ----------
console.log('\nÀrea privada');
for (const ruta of ['/area-privada/', '/area-privada/panel.html', '/area-privada/contrasenya.html']) {
  const pg = await pagina(MOBIL);
  await pg.goto(ORIGEN + ruta); await pg.waitForLoadState('load');
  comprova(`${ruta}: no s'inclou el script ni surt el bàner`, !(await hiHaBanner(pg)) && !(await pg.$('script[src*="consentiment"]')));
  // Encara que algú l'hi inclogués, el mòdul no hi mostra res.
  await pg.addScriptTag({ url: '/js/consentiment.js' }); await pg.waitForFunction(() => !!window.consentiment);
  comprova(`${ruta}: amb el script injectat tampoc no surt el bàner`, !(await hiHaBanner(pg)));
  await pg.context().close();
}

await nav.close();
servidor.close();
console.log(`\n${ok} correctes, ${ko} fallades.`);
process.exit(ko ? 1 : 0);
