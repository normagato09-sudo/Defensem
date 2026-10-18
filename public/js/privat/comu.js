/* Utilitats compartides de l'àrea privada.
   Recorda: aquí només hi ha la interfície. La seguretat real la imposen les polítiques RLS i els
   triggers de la base de dades (supabase/schema.sql). Amagar un botó no dona ni treu permisos. */
(function () {
  'use strict';
  var S = window.Segur;

  var ROLS = { admin: 'Administrador', editor: 'Editor', col_laborador: 'Col·laborador de notícies', consulta: 'Usuari de consulta' };
  var ESTATS = { esborrany: 'Esborrany', pendent: 'Pendent de revisió', publicat: 'Publicat', retornat: 'Retornat per a correccions', arxivat: 'Arxivat' };
  var PROPIETATS = { disabled: 1, checked: 1, hidden: 1, required: 1, selected: 1, multiple: 1 };

  // Crea elements sempre amb textContent: mai innerHTML amb dades d'usuaris.
  function el(tag, at, fills) {
    var e = document.createElement(tag), valor;
    if (at) {
      Object.keys(at).forEach(function (k) {
        var v = at[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'value') valor = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (PROPIETATS[k]) e[k] = !!v;
        else e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (fills || []).forEach(function (f) {
      if (f == null || f === false) return;
      e.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    });
    if (valor !== undefined) e.value = valor;
    return e;
  }

  function missatge(caixa, text, tipus) {
    if (!caixa) return;
    caixa.textContent = text || '';
    caixa.classList.toggle('error', tipus === 'error');
  }

  function client(opcions) {
    var c = S && S.config();
    if (!c || !window.supabase || typeof window.supabase.createClient !== 'function') return null;
    var auth = { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false };
    Object.keys(opcions || {}).forEach(function (k) { auth[k] = opcions[k]; });
    return window.supabase.createClient(c.url, c.key, { auth: auth });
  }

  function esXarxa(e) {
    var m = (e && (e.message || e.name)) || '';
    return /Failed to fetch|NetworkError|Load failed|fetch|AuthRetryableFetchError/i.test(m) && !e.code;
  }

  // Errors de la base de dades (PostgREST). Els dels triggers ja arriben en català.
  function errorText(e) {
    if (!e) return 'Hi ha hagut un error inesperat.';
    var m = String(e.message || ''), c = e.code || '';
    if (/row-level security|permission denied|violates row-level/i.test(m) || c === 'PGRST301') return 'No tens permís per fer aquesta acció.';
    if (c === '42501') return m || 'No tens permís per fer aquesta acció.';
    if (c === '23514') return 'Alguna dada no és vàlida o és massa llarga. Revisa els camps.';
    if (c === '23505') return 'Aquest element ja existeix.';
    if (/JWT|session/i.test(m)) return 'La sessió ha caducat. Torna a iniciar la sessió.';
    if (esXarxa(e)) return 'No s’ha pogut connectar. Comprova la connexió i torna-ho a provar.';
    return 'No s’ha pogut completar l’operació. ' + m;
  }

  // Errors d'autenticació (Supabase Auth).
  function errorAuth(e) {
    if (!e) return 'No s’ha pogut completar l’operació.';
    var m = String(e.message || ''), codi = e.code || '';
    if (codi === 'invalid_credentials' || /Invalid login credentials/i.test(m)) return 'Correu o contrasenya incorrectes.';
    if (e.status === 429 || /rate limit|too many/i.test(m)) return 'Massa intents seguits. Espera uns minuts i torna-ho a provar.';
    if (/not confirmed/i.test(m)) return 'Aquest compte encara no està confirmat. Fes servir l’enllaç del correu d’invitació.';
    if (codi === 'same_password' || /different from the old/i.test(m)) return 'La contrasenya nova ha de ser diferent de l’anterior.';
    if (codi === 'weak_password' || /weak|Password should|pwned|leaked/i.test(m)) return 'Aquesta contrasenya és massa feble o ha aparegut en filtracions. Tria’n una altra de més llarga.';
    if (/session|expired|invalid.*(token|jwt)/i.test(m)) return 'L\'enllaç ha caducat o no és vàlid.';
    if (esXarxa(e) || e.name === 'AuthRetryableFetchError') return 'No s’ha pogut connectar. Comprova la connexió i torna-ho a provar.';
    return 'No s’ha pogut completar l’operació.';
  }

  window.Privat = {
    ROLS: ROLS, ESTATS: ESTATS, NO_CONFIG: 'L\'àrea privada encara no està configurada.',
    el: el, missatge: missatge, client: client, errorText: errorText, errorAuth: errorAuth
  };
})();
