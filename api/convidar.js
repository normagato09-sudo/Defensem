/* Vercel Serverless Function: POST /api/convidar
   Convida un usuari nou per correu i li assigna rol. NOMÉS pot fer-ho un administrador actiu.
   La comprovació es fa AQUÍ (servidor) amb el token de sessió de qui crida; la clau de servei
   mai no surt d'aquest fitxer ni es posa al navegador.
   Variables d'entorn a Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (i opcional SITE_URL). */
const ROLS = ['admin', 'editor', 'col_laborador', 'consulta'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function resposta(res, codi, obj) {
  res.statusCode = codi;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return resposta(res, 405, { error: 'Mètode no permès.' });
  }
  const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!BASE || !KEY) return resposta(res, 500, { error: 'El servidor no està configurat (falten variables d’entorn).' });

  // 1) Qui crida? (el token es verifica contra Supabase Auth)
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return resposta(res, 401, { error: 'Cal iniciar sessió.' });
  let usuari;
  try {
    const r = await fetch(BASE + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return resposta(res, 401, { error: 'La sessió no és vàlida.' });
    usuari = await r.json();
  } catch (e) {
    return resposta(res, 502, { error: 'No s’ha pogut verificar la sessió.' });
  }

  // 2) És administrador ACTIU? (es consulta a la base de dades, no es fia de res del navegador)
  try {
    const r = await fetch(BASE + '/rest/v1/profiles?select=rol,actiu&id=eq.' + encodeURIComponent(usuari.id),
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    const f = r.ok ? await r.json() : [];
    if (!f[0] || f[0].actiu !== true || f[0].rol !== 'admin') return resposta(res, 403, { error: 'No tens permís per fer això.' });
  } catch (e) {
    return resposta(res, 502, { error: 'No s’ha pogut comprovar el teu rol.' });
  }

  // 3) Dades d'entrada
  let cos = req.body;
  if (typeof cos === 'string') { try { cos = JSON.parse(cos); } catch (e) { cos = null; } }
  cos = cos || {};
  const email = typeof cos.email === 'string' ? cos.email.trim().toLowerCase() : '';
  const nom = typeof cos.nom === 'string' ? cos.nom.trim().slice(0, 100) : '';
  const rol = cos.rol;
  if (!EMAIL.test(email) || email.length > 254) return resposta(res, 400, { error: 'El correu electrònic no és vàlid.' });
  if (ROLS.indexOf(rol) === -1) return resposta(res, 400, { error: 'El rol no és vàlid.' });

  // 4) Convidar (Supabase envia el correu perquè la persona triï la seva contrasenya)
  const SITE = (process.env.SITE_URL || ('https://' + (req.headers.host || ''))).replace(/\/+$/, '');
  let nou;
  try {
    const r = await fetch(BASE + '/auth/v1/invite?redirect_to=' + encodeURIComponent(SITE + '/area-privada/contrasenya.html'), {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, data: { nom: nom } })
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      const dup = r.status === 422 || /already|registered|exists/i.test(JSON.stringify(j));
      return resposta(res, dup ? 409 : 400, { error: dup ? 'Ja existeix un usuari amb aquest correu.' : 'No s’ha pogut enviar la invitació.' });
    }
    nou = j;
  } catch (e) {
    return resposta(res, 502, { error: 'No s’ha pogut contactar amb el servei d’usuaris.' });
  }

  // 5) Assignar el rol al perfil (el perfil el crea el trigger de la base de dades amb rol mínim)
  try {
    const r = await fetch(BASE + '/rest/v1/profiles?id=eq.' + encodeURIComponent(nou.id), {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ rol: rol, nom: nom })
    });
    if (!r.ok) return resposta(res, 500, { error: 'La invitació s’ha enviat, però no s’ha pogut assignar el rol. Canvia’l des de la llista d’usuaris.' });
  } catch (e) {
    return resposta(res, 500, { error: 'La invitació s’ha enviat, però no s’ha pogut assignar el rol. Canvia’l des de la llista d’usuaris.' });
  }
  return resposta(res, 200, { ok: true });
};
