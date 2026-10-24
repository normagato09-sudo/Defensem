/* Entitats adherides (/recursos.html#entitats).
   - Llegeix de la taula «entitats» de Supabase NOMÉS les publicades (ho garanteix la política RLS; el filtre
     publicada=eq.true només evita demanar res més). Sense Supabase configurat, es mostra l'estat buit.
   - Formulari «La teva entitat vol adherir-s'hi?»: desa a «sollicituds_entitats» (només inserció, sense lectura).
     Antispam: camp parany ocult, temps mínim d'emplenament i, a la base de dades, límits per correu i per hora. */
(function () {
  'use strict';
  var S = window.Segur, cfg = S && S.config();
  // Mateixa llista que el check de supabase/schema.sql.
  var TIPUS = { associacio: 'Associació', collectiu: 'Col·lectiu', entitat_veinal: 'Entitat veïnal', fundacio: 'Fundació',
    cooperativa: 'Cooperativa', sindicat: 'Sindicat o organització professional', observatori: 'Observatori',
    xarxa: 'Xarxa d’entitats', altres: 'Altres' };
  var BUIT = 'Aviat hi trobareu les entitats adherides.';

  var llista = document.getElementById('ent-llista');
  var form = document.getElementById('adh-form'), msg = document.getElementById('adh-msg'), envia = document.getElementById('adh-envia');
  var totes = [];

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  function estatBuit() {
    llista.textContent = '';
    var b = el('div', 'buit ent-buit');
    b.appendChild(el('p', null, BUIT));
    var bt = el('button', 'btn', 'La teva entitat vol adherir-s’hi?');
    bt.type = 'button'; bt.className = 'btn adh-obre';
    bt.setAttribute('aria-controls', 'adh-form'); bt.setAttribute('aria-expanded', String(!form.hidden));
    bt.addEventListener('click', commuta);
    b.appendChild(bt);
    llista.appendChild(b);
    // Sense entitats, el botó de l'estat buit és l'únic: la capçalera de la secció del formulari s'amaga.
    document.querySelector('.adhesio').classList.add('nomes-form');
  }

  function enllac(href, text, nom) {
    var a = el('a', null, text);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', (text === 'Visita la web' ? 'Visita la web de ' : text + ' de ') + nom + ' (s’obre en una pestanya nova)');
    return a;
  }

  function targeta(e) {
    var c = el('article', 'card ent-card');
    var cap = el('div', 'ent-cap');
    // Logo: fitxer de Storage o, provisionalment, adreça https:// externa.
    var src = !e.logo ? '' : /^https:\/\//i.test(e.logo) ? S.enllac(e.logo) : S.urlImatge(null, e.logo);
    if (src) {
      var i = document.createElement('img');
      i.src = src; i.alt = 'Logo de ' + e.nom; i.loading = 'lazy'; i.className = 'ent-logo'; i.referrerPolicy = 'no-referrer';
      i.onerror = function () { i.remove(); };
      cap.appendChild(i);
    }
    var tit = el('div', 'ent-tit');
    tit.appendChild(el('span', 'etiq', TIPUS[e.tipus] || 'Altres'));
    tit.appendChild(el('h3', null, e.nom));
    if (e.municipi) tit.appendChild(el('p', 'ent-mun', e.municipi));
    cap.appendChild(tit);
    c.appendChild(cap);
    var tx = el('div', 'tx');
    if (e.descripcio) tx.appendChild(el('p', null, e.descripcio));
    var web = /^https:\/\//i.test(e.web || '') ? S.enllac(e.web) : '';
    var ig = /^https:\/\/(www\.)?instagram\.com\//i.test(e.instagram || '') ? S.enllac(e.instagram) : '';
    if (web || ig) {
      var l = el('p', 'ent-enllacos');
      if (web) { var v = enllac(web, 'Visita la web', e.nom); v.className = 'btn'; l.appendChild(v); }
      if (ig) l.appendChild(enllac(ig, 'Instagram', e.nom));
      tx.appendChild(l);
    }
    c.appendChild(tx);
    return c;
  }

  function pinta(l) {
    totes = l.filter(function (e) { return e && typeof e.nom === 'string' && e.nom; })
      .sort(function (a, b) { return a.nom.localeCompare(b.nom, 'ca'); });
    if (!totes.length) { estatBuit(); return; }
    llista.textContent = '';
    totes.forEach(function (e) { llista.appendChild(targeta(e)); });
  }

  if (!cfg) estatBuit();
  else {
    fetch(cfg.url + '/rest/v1/entitats?select=id,nom,tipus,municipi,descripcio,web,instagram,logo&publicada=eq.true&order=nom.asc',
      { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (l) { pinta(Array.isArray(l) ? l : []); })
      .catch(function () {
        llista.textContent = '';
        llista.appendChild(el('p', 'buit', 'Ara mateix no podem carregar la llista d’entitats. Torna-ho a provar més tard.'));
      });
  }

  // ---------- Formulari d'adhesió ----------
  var obertA = 0;
  function missatge(t, error) { msg.textContent = t || ''; msg.classList.toggle('error', !!error); }
  function marca(o) {
    Array.prototype.forEach.call(document.querySelectorAll('.adh-obre'), function (b) { b.setAttribute('aria-expanded', String(o)); });
  }
  function obreForm(enfoca) {
    if (form.hidden) { form.hidden = false; obertA = Date.now(); marca(true); }
    if (enfoca) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('adh-nom').focus({ preventScroll: true }); }
  }
  function commuta() {
    if (!form.hidden) { form.hidden = true; marca(false); return; }
    obreForm(true);
  }
  document.getElementById('adh-obre').addEventListener('click', commuta);
  if (location.hash === '#adhesio') obreForm(true);

  function valor(id) { return document.getElementById(id).value.trim(); }
  function instagram(v) {
    v = v.replace(/^@/, '');
    var m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?/i);
    return m ? '@' + m[1] : v;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    missatge('');
    var camps = ['adh-nom', 'adh-tipus', 'adh-municipi', 'adh-persona', 'adh-email'];
    for (var i = 0; i < camps.length; i++) {
      var c = document.getElementById(camps[i]);
      if (!c.value.trim()) { missatge('Omple tots els camps obligatoris (*).', true); c.focus(); return; }
    }
    var email = document.getElementById('adh-email');
    if (!email.checkValidity() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { missatge('Escriu un correu electrònic vàlid.', true); email.focus(); return; }
    var web = valor('adh-web');
    if (web && !/^https?:\/\/\S+\.\S+$/i.test(web)) { missatge('El web ha de començar per https://', true); document.getElementById('adh-web').focus(); return; }
    var tel = valor('adh-tel');
    if (tel && !/^[0-9 +().-]{6,20}$/.test(tel)) { missatge('El telèfon només pot tenir números, espais i els signes + ( ) . -', true); document.getElementById('adh-tel').focus(); return; }
    var consent = document.getElementById('adh-consent');
    if (!consent.checked) { missatge('Cal que acceptis la informació sobre protecció de dades per enviar la sol·licitud.', true); consent.focus(); return; }
    // Parany: les persones no veuen aquest camp. Si s'omple o el formulari complet s'envia en menys de 3 s
    // des que s'ha obert, és un robot: fem veure que s'ha enviat però no s'envia res.
    if (valor('adh-lloc') || Date.now() - obertA < 3000) { form.reset(); missatge('Gràcies! Hem rebut la sol·licitud.'); return; }
    if (!cfg) { missatge('El formulari encara no està disponible. Escriu-nos a defensemlempordanet@gmail.com.', true); return; }

    var dades = {
      nom_entitat: valor('adh-nom'), tipus: valor('adh-tipus'), municipi: valor('adh-municipi'),
      descripcio: valor('adh-desc'), web: web || null, instagram: instagram(valor('adh-ig')) || null,
      persona_contacte: valor('adh-persona'), email: email.value.trim(), telefon: tel || null,
      missatge: valor('adh-missatge'), consentiment: true
    };
    envia.disabled = true;
    fetch(cfg.url + '/rest/v1/sollicituds_entitats', {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(dades)
    }).then(function (r) {
      if (r.ok) {
        form.reset(); obertA = Date.now();
        missatge('Gràcies! Hem rebut la sol·licitud. La revisarem i us escriurem al correu que ens heu donat.');
        msg.focus();
        return;
      }
      return r.json().catch(function () { return {}; }).then(function (j) {
        // Els missatges dels límits antispam (P0001) ja arriben en català des de la base de dades.
        missatge(j && j.code === 'P0001' && j.message ? j.message : 'No s’ha pogut enviar la sol·licitud. Revisa les dades i torna-ho a provar.', true);
      });
    }).catch(function () {
      missatge('No s’ha pogut connectar. Comprova la connexió i torna-ho a provar.', true);
    }).then(function () { envia.disabled = false; });
  });
})();
