// Prova de api/convidar.js amb fetch simulat (sense xarxa ni Supabase real).
// Ús: node proves/prova-convidar.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const BASE = 'https://projecte.supabase.co';
const SECRET = 'service-role-SECRETA-de-prova';
process.env.SUPABASE_URL = BASE + '/';
process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET;
process.env.SITE_URL = 'https://defensem.example/';
const convidar = require('../api/convidar.js');

// "Supabase" simulat
const TOKENS = { 'tok-admin': 'u-admin', 'tok-editor': 'u-editor', 'tok-col': 'u-col', 'tok-inactiu': 'u-inactiu', 'tok-sense': 'u-sense' };
const PERFILS = { 'u-admin': { rol: 'admin', actiu: true }, 'u-editor': { rol: 'editor', actiu: true },
  'u-col': { rol: 'col_laborador', actiu: true }, 'u-inactiu': { rol: 'admin', actiu: false } };
let crides = [];
const EXISTENTS = new Set(['ja@existeix.cat']);
globalThis.fetch = async (url, opt = {}) => {
  const h = opt.headers || {};
  crides.push({ url, method: opt.method || 'GET', headers: h, body: opt.body });
  const json = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
  if (h.apikey !== SECRET) return json(401, {});
  if (url === BASE + '/auth/v1/user') {
    const id = TOKENS[(h.Authorization || '').replace('Bearer ', '')];
    return id ? json(200, { id }) : json(401, { msg: 'invalid JWT' });
  }
  if (url.startsWith(BASE + '/rest/v1/profiles?select=rol,actiu&id=eq.')) {
    const id = decodeURIComponent(url.split('id=eq.')[1]);
    return json(200, PERFILS[id] ? [PERFILS[id]] : []);
  }
  if (url.startsWith(BASE + '/auth/v1/invite')) {
    const b = JSON.parse(opt.body);
    if (EXISTENTS.has(b.email)) return json(422, { msg: 'A user with this email address has already been registered' });
    return json(200, { id: 'u-nou', email: b.email });
  }
  if (url.startsWith(BASE + '/rest/v1/profiles?id=eq.') && opt.method === 'PATCH') return json(204, null);
  return json(404, {});
};

async function crida({ method = 'POST', token, body } = {}) {
  crides = [];
  const req = { method, headers: { host: 'x.vercel.app' }, body };
  if (token) req.headers.authorization = 'Bearer ' + token;
  const res = { statusCode: 0, headers: {}, cos: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(c) { this.cos = c || ''; } };
  await convidar(req, res);
  return { status: res.statusCode, cos: JSON.parse(res.cos || '{}'), text: res.cos, headers: res.headers };
}

let ok = 0, ko = 0;
const totesRespostes = [];
function comprova(nom, cond) { if (cond) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FALLA ' + nom); } }
const invitacions = () => crides.filter((c) => c.url.includes('/auth/v1/invite')).length;
async function prova(nom, opts, codi, extra) {
  const r = await crida(opts);
  totesRespostes.push(r.text + JSON.stringify(r.headers));
  comprova(`${nom} → ${codi} (rebut ${r.status})`, r.status === codi && (!extra || extra(r)));
  return r;
}
const BO = { email: '  Nova.Persona@Exemple.CAT ', nom: 'Nova Persona', rol: 'col_laborador' };

await prova('GET', { method: 'GET', token: 'tok-admin' }, 405, (r) => r.headers.allow === 'POST');
await prova('sense token', { body: BO }, 401, () => invitacions() === 0);
await prova('token invàlid', { token: 'tok-fals', body: BO }, 401, () => invitacions() === 0);
await prova('col·laborador', { token: 'tok-col', body: BO }, 403, () => invitacions() === 0);
await prova('editor', { token: 'tok-editor', body: BO }, 403, () => invitacions() === 0);
await prova('admin desactivat', { token: 'tok-inactiu', body: BO }, 403, () => invitacions() === 0);
await prova('usuari sense perfil', { token: 'tok-sense', body: BO }, 403, () => invitacions() === 0);
await prova('rol inventat', { token: 'tok-admin', body: { ...BO, rol: 'superadmin' } }, 400, () => invitacions() === 0);
await prova('sense rol', { token: 'tok-admin', body: { email: 'a@b.cat' } }, 400, () => invitacions() === 0);
await prova('correu invàlid', { token: 'tok-admin', body: { ...BO, email: 'no-es-un-correu' } }, 400, () => invitacions() === 0);
await prova('cos JSON trencat', { token: 'tok-admin', body: '{trencat' }, 400, () => invitacions() === 0);
const r = await prova('admin actiu', { token: 'tok-admin', body: JSON.stringify(BO) }, 200, (x) => x.cos.ok === true);
const inv = crides.find((c) => c.url.includes('/auth/v1/invite'));
const patch = crides.find((c) => c.method === 'PATCH');
comprova('invita el correu en minúscules i sense espais', JSON.parse(inv.body).email === 'nova.persona@exemple.cat');
comprova('redirigeix a /area-privada/contrasenya.html del SITE_URL',
  decodeURIComponent(inv.url.split('redirect_to=')[1]) === 'https://defensem.example/area-privada/contrasenya.html');
comprova('assigna el rol al perfil nou', patch && patch.url.endsWith('id=eq.u-nou') && JSON.parse(patch.body).rol === 'col_laborador' && JSON.parse(patch.body).nom === 'Nova Persona');
await prova('usuari ja existent', { token: 'tok-admin', body: { ...BO, email: 'ja@existeix.cat' } }, 409, (x) => /Ja existeix/.test(x.cos.error));
comprova('Cache-Control: no-store', r.headers['cache-control'] === 'no-store');
comprova('la clau de servei no surt en cap resposta', totesRespostes.every((t) => !t.includes(SECRET)));

delete process.env.SUPABASE_SERVICE_ROLE_KEY;
await prova('sense variables d\'entorn', { token: 'tok-admin', body: BO }, 500);

console.log(`\n${ok} correctes, ${ko} fallades.`);
process.exit(ko ? 1 : 0);
