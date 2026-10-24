/* Defensem Admin: la zona privada com a app (PWA) a /app.
   Inici amb blocs segons el rol → cada bloc té la mateixa estructura: «← Inici», títol, botó gran «+ Nou/Nova»,
   pestanyes per estat i llista en targetes; en tocar-ne una: editar, vista prèvia, publicar/ocultar i esborrar.
   La interfície s'adapta al rol per comoditat, però QUI DECIDEIX què es pot fer són les polítiques RLS i els
   triggers de la base de dades (supabase/schema.sql). Mai no s'escriu HTML amb dades: tot va per textContent,
   i el text de les notícies es neteja amb Segur.neteja / Segur.serialitza.
   Rutes (hash): #/ · #/<bloc>[?p=<pestanya>] · #/<bloc>/<id> · #/<bloc>/nou · #/perfil */
(function () {
  'use strict';
  var S = window.Segur, cfg = S && S.config();
  var vista = document.getElementById('vista'), avisos = document.getElementById('avisos'), qui = document.getElementById('app-qui');
  var sb = cfg && window.supabase && typeof window.supabase.createClient === 'function'
    ? window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
  var jo = null, torn = 0;
  var ROLS = { admin: 'Administrador', editor: 'Editor', col_laborador: 'Col·laborador de notícies', consulta: 'Usuari de consulta' };
  var EDITA = ['admin', 'editor'], ESCRIU = ['admin', 'editor', 'col_laborador'], TOTS = ['admin', 'editor', 'col_laborador', 'consulta'];
  var SENSE_PERMIS = 'No tens permís per fer aquesta acció.';
  var CLAU_ESB = 'defensem.app.esborrany.';
  // Mateixes llistes que els check de supabase/schema.sql
  var TIPUS_ENT = { associacio: 'Associació', collectiu: 'Col·lectiu', entitat_veinal: 'Entitat veïnal', fundacio: 'Fundació',
    cooperativa: 'Cooperativa', sindicat: 'Sindicat o organització professional', observatori: 'Observatori', xarxa: 'Xarxa d’entitats', altres: 'Altres' };
  var CAT_EINA = { urbanisme: 'Urbanisme', energia: 'Energia', paisatge: 'Paisatge', medi_natural: 'Medi natural', altres: 'Altres' };
  var ESTATS = { esborrany: 'Esborrany', pendent: 'En revisió', publicat: 'Publicada', retornat: 'Retornada', arxivat: 'Oculta' };
  var PROPIETATS = { disabled: 1, checked: 1, hidden: 1, required: 1, selected: 1, multiple: 1 };

  // ------------------------------------------------------------------ utilitats
  function el(tag, at, fills) {
    var e = document.createElement(tag), valor;
    Object.keys(at || {}).forEach(function (k) {
      var v = at[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'value') valor = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (PROPIETATS[k]) e[k] = !!v;
      else e.setAttribute(k, v === true ? '' : String(v));
    });
    (fills || []).forEach(function (f) {
      if (f == null || f === false) return;
      e.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    });
    if (valor !== undefined) e.value = valor;
    return e;
  }
  function avis(text, tipus) {
    clearTimeout(avis.t);
    avisos.textContent = '';
    if (!text) return;
    avisos.appendChild(el('p', { class: 'app-avis' + (tipus === 'error' ? ' error' : ''), role: tipus === 'error' ? 'alert' : null }, [text]));
    avis.t = setTimeout(function () { avisos.textContent = ''; }, tipus === 'error' ? 9000 : 3500);
  }
  function esXarxa(e) { return /Failed to fetch|NetworkError|Load failed|fetch/i.test((e && (e.message || e.name)) || '') && !(e && e.code); }
  function errorText(e) {
    if (!e) return 'Hi ha hagut un error inesperat. Torna-ho a provar.';
    var m = String(e.message || ''), c = e.code || '';
    if (/row-level security|permission denied|violates row-level/i.test(m) || c === 'PGRST301') return SENSE_PERMIS;
    if (c === '42501' || c === 'P0001') return m || SENSE_PERMIS;
    if (c === '23514') return 'Alguna dada no és vàlida o és massa llarga. Revisa els camps marcats.';
    if (c === '23505') return 'Ja n’hi ha un d’igual.';
    if (c === '42P01' || /does not exist|schema cache/i.test(m)) return 'Aquesta part encara no està preparada a la base de dades (falta executar l’SQL nou).';
    if (/JWT|session/i.test(m)) return 'La sessió ha caducat. Torna a entrar.';
    if (esXarxa(e)) return 'No hi ha connexió. Comprova-la i torna-ho a provar.';
    return 'No s’ha pogut fer. ' + m;
  }
  function falla(e) { avis(errorText(e), 'error'); }
  function pinta(t, nodes) {
    if (t !== torn) return false;
    vista.textContent = '';
    nodes.forEach(function (n) { if (n) vista.appendChild(n); });
    return true;
  }
  function pot(rols) { return !!jo && rols.indexOf(jo.rol) !== -1; }
  function dataCurta(iso) { return S.dataCurta(iso); }
  function boto(text, classe, clic, extra) {
    var at = { type: 'button', class: 'app-btn ' + (classe || ''), onclick: clic };
    Object.keys(extra || {}).forEach(function (k) { at[k] = extra[k]; });
    return el('button', at, [text]);
  }
  // Escriu i comprova que ha afectat alguna fila (si no, RLS l'ha bloquejada en silenci).
  async function escriu(consulta) {
    var r = await consulta.select('id');
    if (r.error) { falla(r.error); return null; }
    if (!r.data || (Array.isArray(r.data) && !r.data.length)) { avis(SENSE_PERMIS, 'error'); return null; }
    return r.data;
  }
  function confirma(text) { return window.confirm(text); }
  function tornaInici() { return el('a', { href: '#/', class: 'app-inici' }, ['← Inici']); }
  function imatgeUrl(c) {
    if (!c) return '';
    if (/^\/img\/[a-z0-9\/._-]+$/i.test(c)) return c;          // imatges de la web (cartells antics)
    if (/^https:\/\//i.test(c)) return S.enllac(c);           // logos externs provisionals
    return S.urlImatge(null, c);
  }
  function esborraFitxer(cami) {
    if (!cami || !jo || /^(\/|https:)/.test(cami)) return;
    if (cami.indexOf(jo.id + '/') !== 0 && jo.rol !== 'admin') return;
    sb.storage.from('portades').remove([cami]).catch(function () {});
  }

  // ------------------------------------------------------------------ fotos: càmera o galeria, comprimides
  function comprimeix(fitxer) {
    return new Promise(function (ok, ko) {
      if (!/^image\//.test(fitxer.type || '')) { ko(new Error('Aquest fitxer no és una imatge.')); return; }
      var url = URL.createObjectURL(fitxer), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (b) ok(b); else ko(new Error('No s’ha pogut preparar la foto.')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('No s’ha pogut llegir la foto. Prova’n una altra.')); };
      img.src = url;
    });
  }
  async function pujaFoto(blob) {
    var cami = jo.id + '/' + crypto.randomUUID() + '.jpg';
    var r = await sb.storage.from('portades').upload(cami, blob, { contentType: 'image/jpeg', upsert: false });
    if (r.error) throw new Error('No s’ha pogut pujar la foto. ' + (/security|policy|403/i.test(r.error.message || '') ? SENSE_PERMIS : 'Torna-ho a provar.'));
    return cami;
  }

  // ------------------------------------------------------------------ instal·lació (PWA)
  var diferit = null;
  var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function esInstallada() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); diferit = e; actualitzaInstal(); });
  window.addEventListener('appinstalled', function () { diferit = null; actualitzaInstal(); avis('App instal·lada.'); });
  function caixaInstal() {
    var caixa = el('div', { class: 'app-instal', 'data-instal': '' });
    omple(caixa);
    return caixa;
  }
  function omple(caixa) {
    caixa.textContent = '';
    if (esInstallada()) { caixa.hidden = true; return; }
    caixa.hidden = false;
    if (diferit) {
      caixa.appendChild(boto('Instal·la l’app', 'v', async function () {
        var e = diferit; diferit = null; e.prompt();
        try { await e.userChoice; } catch (x) { /* res */ }
        actualitzaInstal();
      }));
    } else if (esIOS) {
      caixa.appendChild(el('p', { class: 'app-ajuda-ios' }, [el('strong', null, ['Instal·la l’app a l’iPhone: ']),
        'obre aquesta pàgina amb Safari, toca el botó Comparteix (el quadrat amb la fletxa cap amunt) i tria «Afegeix a la pantalla d’inici».']));
    } else caixa.hidden = true;
  }
  function actualitzaInstal() { Array.prototype.forEach.call(document.querySelectorAll('[data-instal]'), omple); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(function () { /* sense SW també funciona */ });
  }

  // ------------------------------------------------------------------ esborranys automàtics (al dispositiu)
  function esbClau(bloc, id) { return CLAU_ESB + bloc + '.' + (id || 'nou'); }
  function esbLlegeix(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function esbDesa(k, v) { try { localStorage.setItem(k, JSON.stringify({ v: v, t: Date.now() })); } catch (e) { /* ple o no disponible */ } }
  function esbEsborra(k) { try { localStorage.removeItem(k); } catch (e) { /* res */ } }
  function esbEsborraTots() {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(CLAU_ESB) === 0) localStorage.removeItem(k); }); } catch (e) { /* res */ }
  }

  // ------------------------------------------------------------------ icones dels blocs (SVG)
  var ICONES = {
    noticies: 'M4 5h13v14H6a2 2 0 0 1-2-2V5zm13 4h3v8a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4',
    agenda: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3M13 14h3M8 17h3',
    entitats: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5',
    eines: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
    usuaris: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7M18 4l2 2-2 2',
    perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
    documents: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'
  };
  function icona(nom) {
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'app-icona');
    p.setAttribute('d', ICONES[nom]); s.appendChild(p); return s;
  }

  // ------------------------------------------------------------------ definició dels blocs
  function publicadaOculta() {
    return [['publicades', 'Publicades', function (r) { return r.publicada; }], ['ocultes', 'Ocultes', function (r) { return !r.publicada; }]];
  }
  function camiFoto(k, t) { return { k: k, t: t, tipus: 'foto' }; }
  var BLOCS = {
    noticies: {
      titol: 'Notícies', rols: ESCRIU, nou: '+ Nova notícia', taula: 'publicacions',
      camps: 'id,tipus,titol,resum,contingut,imatge,estat,autor_id,updated_at,nota_revisio',
      ordre: ['updated_at', false],
      pestanyes: [['esborranys', 'Esborranys', function (r) { return ['esborrany', 'retornat', 'arxivat'].indexOf(r.estat) !== -1; }],
        ['revisio', 'En revisió', function (r) { return r.estat === 'pendent'; }],
        ['publicades', 'Publicades', function (r) { return r.estat === 'publicat'; }]],
      comptador: function () {
        if (pot(EDITA)) return { q: sb.from('publicacions').select('id', { count: 'exact', head: true }).eq('estat', 'pendent'), t: ['en revisió', 'en revisió'] };
        return { q: sb.from('publicacions').select('id', { count: 'exact', head: true }).eq('estat', 'retornat').eq('autor_id', jo.id), t: ['retornada', 'retornades'] };
      },
      targeta: function (r) {
        return [el('span', { class: 'app-estat ' + r.estat }, [ESTATS[r.estat] || r.estat]), el('h3', null, [r.titol]),
          el('p', { class: 'app-meta' }, [(r.tipus === 'comunicat' ? 'Comunicat' : 'Notícia') + ' · ' + dataCurta(r.updated_at)]),
          r.estat === 'retornat' && r.nota_revisio ? el('p', { class: 'app-nota' }, ['Nota: ' + r.nota_revisio]) : null];
      },
      formulari: [
        { k: 'tipus', t: 'Tipus', tipus: 'select', opcions: { noticia: 'Notícia', comunicat: 'Comunicat' }, defecte: 'noticia' },
        { k: 'titol', t: 'Títol', tipus: 'text', req: true, max: 200 },
        { k: 'resum', t: 'Resum (una o dues frases)', tipus: 'textarea', max: 500, ajuda: 'Es veu a les targetes de la web.' },
        camiFoto('imatge', 'Foto de portada'),
        { k: 'contingut', t: 'Text', tipus: 'ric', max: 50000 }
      ]
    },
    agenda: {
      titol: 'Agenda', rols: EDITA, nou: '+ Nou acte', taula: 'actes',
      camps: 'id,titol,data,hora,data_fi,quan,lloc,descripcio,organitza,cartell,publicada,updated_at', ordre: ['data', false],
      pestanyes: publicadaOculta(),
      comptador: function () { return { q: sb.from('actes').select('id', { count: 'exact', head: true }).eq('publicada', false), t: ['ocult', 'ocults'] }; },
      targeta: function (r) {
        return [el('span', { class: 'app-estat ' + (r.publicada ? 'publicat' : 'arxivat') }, [r.publicada ? 'Publicat' : 'Ocult']), el('h3', null, [r.titol]),
          el('p', { class: 'app-meta' }, [r.quan || dataCurta(r.data + 'T12:00:00') + (r.hora ? ' · ' + r.hora.slice(0, 5) : '')]), r.lloc ? el('p', { class: 'app-meta' }, [r.lloc]) : null];
      },
      formulari: [
        { k: 'titol', t: 'Títol', tipus: 'text', req: true, max: 200 },
        { k: 'data', t: 'Data', tipus: 'date', req: true },
        { k: 'hora', t: 'Hora (opcional)', tipus: 'time' },
        { k: 'data_fi', t: 'Últim dia, si dura més d’un dia (opcional)', tipus: 'date' },
        { k: 'quan', t: 'Com es mostra la data (opcional)', tipus: 'text', max: 120, ajuda: 'Per exemple: «22 i 23 de juliol del 2026 · 19.00 h». Si és buit, es fa a partir de la data i l’hora.' },
        { k: 'lloc', t: 'Lloc', tipus: 'text', max: 200 },
        { k: 'descripcio', t: 'Descripció', tipus: 'textarea', max: 2000 },
        { k: 'organitza', t: 'Organitza', tipus: 'text', max: 300, ajuda: 'Un @nom d’Instagram s’hi convertirà en enllaç.' },
        camiFoto('cartell', 'Cartell (opcional)')
      ]
    },
    entitats: {
      titol: 'Entitats', rols: EDITA, nou: '+ Nova entitat', taula: 'entitats',
      camps: 'id,nom,tipus,municipi,descripcio,web,instagram,logo,publicada,updated_at', ordre: ['nom', true],
      pestanyes: publicadaOculta(),
      comptador: function () { return { q: sb.from('entitats').select('id', { count: 'exact', head: true }).eq('publicada', false), t: ['oculta', 'ocultes'] }; },
      targeta: function (r) {
        return [el('span', { class: 'app-estat ' + (r.publicada ? 'publicat' : 'arxivat') }, [r.publicada ? 'Publicada' : 'Oculta']), el('h3', null, [r.nom]),
          el('p', { class: 'app-meta' }, [(TIPUS_ENT[r.tipus] || r.tipus) + (r.municipi ? ' · ' + r.municipi : '')])];
      },
      formulari: [
        { k: 'nom', t: 'Nom', tipus: 'text', req: true, max: 200 },
        { k: 'tipus', t: 'Tipus', tipus: 'select', opcions: TIPUS_ENT, defecte: 'associacio' },
        { k: 'municipi', t: 'Municipi', tipus: 'text', max: 100 },
        { k: 'descripcio', t: 'Descripció breu', tipus: 'textarea', max: 600 },
        { k: 'web', t: 'Web (opcional)', tipus: 'url', https: true, max: 300 },
        { k: 'instagram', t: 'Instagram (opcional)', tipus: 'text', max: 100, ajuda: '@nom o adreça del perfil.', instagram: true },
        camiFoto('logo', 'Logo (opcional)')
      ]
    },
    eines: {
      titol: 'Eines', rols: EDITA, nou: '+ Nova eina', taula: 'eines',
      camps: 'id,nom,organisme,descripcio,url,categoria,ordre,publicada,updated_at', ordre: ['ordre', true],
      pestanyes: publicadaOculta(),
      comptador: function () { return { q: sb.from('eines').select('id', { count: 'exact', head: true }).eq('publicada', false), t: ['oculta', 'ocultes'] }; },
      targeta: function (r) {
        return [el('span', { class: 'app-estat ' + (r.publicada ? 'publicat' : 'arxivat') }, [r.publicada ? 'Publicada' : 'Oculta']), el('h3', null, [r.nom]),
          el('p', { class: 'app-meta' }, [(CAT_EINA[r.categoria] || r.categoria) + (r.organisme ? ' · ' + r.organisme : '')])];
      },
      formulari: [
        { k: 'nom', t: 'Nom', tipus: 'text', req: true, max: 200 },
        { k: 'organisme', t: 'Organisme', tipus: 'text', max: 200 },
        { k: 'descripcio', t: 'Descripció', tipus: 'textarea', max: 600 },
        { k: 'url', t: 'Adreça (https://)', tipus: 'url', https: true, req: true, max: 500 },
        { k: 'categoria', t: 'Categoria', tipus: 'select', opcions: CAT_EINA, defecte: 'urbanisme' },
        { k: 'ordre', t: 'Ordre (les més petites, primer)', tipus: 'number', defecte: 10 }
      ]
    },
    usuaris: {
      titol: 'Usuaris', rols: ['admin'], nou: '+ Convida', taula: 'profiles', camps: 'id,email,nom,rol,actiu,created_at', ordre: ['created_at', true],
      pestanyes: [['actius', 'Actius', function (r) { return r.actiu; }], ['desactivats', 'Desactivats', function (r) { return !r.actiu; }]],
      targeta: function (r) {
        return [el('span', { class: 'app-estat ' + (r.actiu ? 'publicat' : 'arxivat') }, [ROLS[r.rol] || r.rol]), el('h3', null, [(r.nom || r.email) + (r.id === jo.id ? ' (tu)' : '')]),
          el('p', { class: 'app-meta' }, [r.email])];
      }
    }
  };
  var ORDRE_BLOCS = ['noticies', 'agenda', 'entitats', 'eines', 'usuaris'];

  // ------------------------------------------------------------------ Inici
  async function vInici(t) {
    var graella = el('ul', { class: 'app-blocs' });
    var comptes = [];
    ORDRE_BLOCS.forEach(function (k) {
      var B = BLOCS[k];
      if (!pot(B.rols)) return;
      var num = el('span', { class: 'app-compte', hidden: true });
      graella.appendChild(el('li', null, [el('a', { href: '#/' + k, class: 'app-bloc' }, [icona(k), el('span', { class: 'app-bloc-nom' }, [B.titol]), num])]));
      if (B.comptador) comptes.push([B.comptador(), num]);
    });
    graella.appendChild(el('li', null, [el('a', { href: '/area-privada/panel.html#/documents', class: 'app-bloc' }, [icona('documents'), el('span', { class: 'app-bloc-nom' }, ['Documents'])])]));
    graella.appendChild(el('li', null, [el('a', { href: '#/perfil', class: 'app-bloc' }, [icona('perfil'), el('span', { class: 'app-bloc-nom' }, ['El meu perfil'])])]));
    pinta(t, [el('h1', null, ['Hola, ' + (jo.nom || jo.email)]), caixaInstal(), graella]);
    comptes.forEach(function (c) {
      c[0].q.then(function (r) {
        if (r.error || !r.count) return;
        c[1].textContent = r.count + ' ' + c[0].t[r.count === 1 ? 0 : 1]; c[1].hidden = false;
      }, function () {});
    });
  }

  // ------------------------------------------------------------------ llista d'un bloc
  async function vLlista(t, clau, pestanya) {
    var B = BLOCS[clau];
    var r = await sb.from(B.taula).select(B.camps).order(B.ordre[0], { ascending: B.ordre[1] });
    if (r.error) throw r.error;
    var files = r.data || [];
    if (!B.pestanyes.some(function (p) { return p[0] === pestanya; })) pestanya = B.pestanyes[0][0];
    var llista = el('ul', { class: 'app-llista', id: 'app-llista', role: 'tabpanel' });
    var tabs = el('div', { class: 'app-pestanyes', role: 'tablist', 'aria-label': 'Estat' });
    function mostra(p) {
      pestanya = p;
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-p') === p)); });
      history.replaceState(null, '', '#/' + clau + '?p=' + p);
      llista.textContent = '';
      var filtre = B.pestanyes.filter(function (x) { return x[0] === p; })[0][2];
      var sel = files.filter(filtre);
      if (!sel.length) { llista.appendChild(el('li', { class: 'app-buit' }, ['No n’hi ha cap.'])); return; }
      sel.forEach(function (f) { llista.appendChild(el('li', null, [el('a', { href: '#/' + clau + '/' + f.id, class: 'app-targeta' }, B.targeta(f))])); });
    }
    B.pestanyes.forEach(function (p) {
      var n = files.filter(p[2]).length;
      tabs.appendChild(el('button', { type: 'button', role: 'tab', class: 'app-pestanya', 'data-p': p[0], 'aria-controls': 'app-llista', onclick: function () { mostra(p[0]); } },
        [p[1], el('span', { class: 'app-pestanya-n' }, [String(n)])]));
    });
    var nou = B.nou ? el('a', { href: '#/' + clau + '/nou', class: 'app-btn gran v app-nou' }, [B.nou]) : null;
    if (pinta(t, [tornaInici(), el('div', { class: 'app-titol' }, [el('h1', null, [B.titol]), nou]), tabs, llista])) mostra(pestanya);
  }

  // ------------------------------------------------------------------ formulari genèric
  // Construeix els camps i en retorna { nodes, valors(), posa(v), foto }.
  function formulari(camps, inicial, editable) {
    var nodes = [], getters = {}, setters = {}, foto = null;
    camps.forEach(function (c) {
      var id = 'f-' + c.k, v = inicial[c.k] != null ? inicial[c.k] : (c.defecte != null ? c.defecte : ''), ctrl;
      if (c.tipus === 'select') {
        ctrl = el('select', { id: id, disabled: !editable, value: v }, Object.keys(c.opcions).map(function (k) { return el('option', { value: k }, [c.opcions[k]]); }));
      } else if (c.tipus === 'textarea') {
        ctrl = el('textarea', { id: id, maxlength: c.max, disabled: !editable, rows: 4, value: v });
      } else if (c.tipus === 'ric') {
        var ed = el('div', { id: id, class: 'app-ric', contenteditable: editable ? 'true' : 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': id + '-e' });
        ed.appendChild(S.neteja(v || ''));
        ed.addEventListener('paste', function (e) { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
        ed.addEventListener('drop', function (e) { e.preventDefault(); });
        var ordre = function (o, val) { ed.focus(); document.execCommand(o, false, val == null ? null : val); };
        var barra = editable ? el('div', { class: 'app-barra', role: 'toolbar', 'aria-label': 'Format del text' }, [
          ['Negreta', function () { ordre('bold'); }], ['Cursiva', function () { ordre('italic'); }], ['Llista', function () { ordre('insertUnorderedList'); }],
          ['Enllaç', function () {
            var u = window.prompt('Adreça de l’enllaç (https://…)', 'https://');
            if (u && /^https:\/\/\S+$/i.test(u.trim()) && S.enllac(u.trim())) ordre('createLink', S.enllac(u.trim())); else if (u) avis('L’enllaç ha de començar per https://', 'error');
          }]].map(function (b) { var x = el('button', { type: 'button', onclick: b[1] }, [b[0]]); x.addEventListener('mousedown', function (e) { e.preventDefault(); }); return x; })) : null;
        nodes.push(el('div', { class: 'app-camp' }, [el('span', { class: 'app-etiq', id: id + '-e' }, [c.t]), barra, ed]));
        getters[c.k] = function () { return S.serialitza(ed.innerHTML); };
        setters[c.k] = function (x) { ed.textContent = ''; ed.appendChild(S.neteja(x || '')); };
        return;
      } else if (c.tipus === 'foto') {
        var actual = v || null, nova = null, treure = false;
        var prev = el('div', { class: 'app-foto-prev' });
        var input = el('input', { type: 'file', id: id, accept: 'image/*', class: 'app-fitxer', disabled: !editable });
        var pintaPrev = function () {
          prev.textContent = '';
          var src = nova ? URL.createObjectURL(nova) : (treure ? '' : imatgeUrl(actual));
          if (src) prev.appendChild(el('img', { src: src, alt: c.t }));
          else prev.appendChild(el('span', { class: 'app-meta' }, ['Sense foto.']));
        };
        input.addEventListener('change', async function () {
          var f = input.files && input.files[0]; input.value = '';
          if (!f) return;
          try { nova = await comprimeix(f); treure = false; pintaPrev(); avis('Foto preparada (' + Math.round(nova.size / 1024) + ' kB). Es pujarà en desar.'); }
          catch (e) { avis(e.message, 'error'); }
        });
        pintaPrev();
        nodes.push(el('div', { class: 'app-camp' }, [el('span', { class: 'app-etiq' }, [c.t]), prev, editable ? el('div', { class: 'app-fila' }, [
          el('label', { for: id, class: 'app-btn' }, ['Fes una foto o tria’n una']), input,
          boto('Treu-la', 'o', function () { nova = null; treure = true; pintaPrev(); })]) : null]));
        foto = { k: c.k, actual: function () { return actual; }, nova: function () { return nova; }, treure: function () { return treure; } };
        return;
      } else {
        var tipusInput = { text: 'text', url: 'url', date: 'date', time: 'time', number: 'number' }[c.tipus] || 'text';
        ctrl = el('input', { id: id, type: tipusInput, maxlength: c.max, disabled: !editable, inputmode: c.tipus === 'url' ? 'url' : null,
          placeholder: c.https ? 'https://' : null, value: c.tipus === 'time' && v ? String(v).slice(0, 5) : v });
      }
      nodes.push(el('div', { class: 'app-camp' }, [el('label', { for: id, class: 'app-etiq' }, [c.t + (c.req ? ' *' : '')]), ctrl,
        c.ajuda ? el('span', { class: 'app-ajuda' }, [c.ajuda]) : null]));
      getters[c.k] = function () { return ctrl.value; };
      setters[c.k] = function (x) { ctrl.value = x == null ? '' : x; };
    });
    return {
      nodes: nodes, foto: foto,
      valors: function () { var o = {}; Object.keys(getters).forEach(function (k) { o[k] = getters[k](); }); return o; },
      posa: function (o) { Object.keys(o || {}).forEach(function (k) { if (setters[k]) setters[k](o[k]); }); }
    };
  }
  // Valida i converteix els valors del formulari al format de la base de dades. Retorna null si hi ha un error.
  function neteja(camps, v) {
    var o = {};
    for (var i = 0; i < camps.length; i++) {
      var c = camps[i];
      if (c.tipus === 'foto') continue;
      var x = typeof v[c.k] === 'string' ? v[c.k].trim() : v[c.k];
      if (c.req && !x) { avis('Omple «' + c.t.replace(/ \(.*\)$/, '') + '».', 'error'); var f = document.getElementById('f-' + c.k); if (f) f.focus(); return null; }
      if (c.https && x && (!/^https:\/\/\S+$/i.test(x) || !S.enllac(x))) { avis('L’adreça ha de començar per https://', 'error'); document.getElementById('f-' + c.k).focus(); return null; }
      if (c.instagram && x) {
        var m = x.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i) || x.match(/^@?([A-Za-z0-9._]{1,30})$/);
        if (!m) { avis('L’Instagram ha de ser @nom o una adreça d’instagram.com.', 'error'); document.getElementById('f-' + c.k).focus(); return null; }
        x = 'https://www.instagram.com/' + m[1] + '/';
      }
      if (c.tipus === 'number') x = x === '' ? 0 : parseInt(x, 10);
      if ((c.tipus === 'date' || c.tipus === 'time' || c.tipus === 'url' || c.instagram) && !x) x = null;
      o[c.k] = x;
    }
    return o;
  }

  // ------------------------------------------------------------------ vista d'edició (comuna)
  async function vEdita(t, clau, id) {
    var B = BLOCS[clau], fila = null;
    if (id !== 'nou') {
      if (!S.esUuid(id)) { pinta(t, [tornaInici(), el('h1', null, ['No l’hem trobat.'])]); return; }
      var r = await sb.from(B.taula).select(B.camps).eq('id', id).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) { pinta(t, [tornaInici(), el('h1', null, ['No l’hem trobat.']), el('p', null, ['Potser ja no existeix o no hi tens accés.'])]); return; }
      fila = r.data;
    }
    if (clau === 'usuaris') return fila ? vUsuari(t, fila) : vConvida(t);

    var editora = pot(EDITA);
    var editable = clau !== 'noticies' || !fila || editora || (fila.autor_id === jo.id && (fila.estat === 'esborrany' || fila.estat === 'retornat'));
    var F = formulari(B.formulari, fila || {}, editable);
    var kEsb = esbClau(clau, fila && fila.id);
    var esb = editable ? esbLlegeix(kEsb) : null;
    var avisEsb = null;
    if (esb && esb.v) {
      F.posa(esb.v);
      avisEsb = el('div', { class: 'app-avis-esb' }, ['S’ha recuperat l’esborrany que no s’havia desat. ',
        boto('Descarta’l', 'o petit', function () { esbEsborra(kEsb); encamina(); })]);
    }
    var temps = null;
    var form = el('form', { class: 'app-form', novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, F.nodes);
    if (editable) form.addEventListener('input', function () { clearTimeout(temps); temps = setTimeout(function () { esbDesa(kEsb, F.valors()); }, 600); });

    var botons = [];
    async function desa(extra, missatge) {
      var dades = neteja(B.formulari, F.valors());
      if (!dades) return false;
      Object.keys(extra || {}).forEach(function (k) { dades[k] = extra[k]; });
      botons.forEach(function (b) { b.disabled = true; });
      var pujada = null;
      try {
        if (F.foto) {
          var fk = F.foto.k, actual = F.foto.actual();
          if (F.foto.nova()) { pujada = await pujaFoto(F.foto.nova()); dades[fk] = pujada; }
          else dades[fk] = F.foto.treure() ? null : actual;
        }
        if (clau === 'noticies' && !fila) { dades.autor_id = jo.id; if (!dades.estat) dades.estat = 'esborrany'; }
        if (clau === 'noticies' && fila && !editora) delete dades.nota_revisio;
        var res = fila ? await escriu(sb.from(B.taula).update(dades).eq('id', fila.id)) : await escriu(sb.from(B.taula).insert(dades));
        if (!res) { if (pujada) esborraFitxer(pujada); return false; }
        if (F.foto && fila && F.foto.actual() && F.foto.actual() !== dades[F.foto.k]) esborraFitxer(F.foto.actual());
        esbEsborra(kEsb);
        avis(missatge || 'Desat.');
        var nouId = Array.isArray(res) ? res[0].id : res.id;
        if (!fila) location.hash = '#/' + clau + '/' + nouId; else encamina();
        return true;
      } catch (e) {
        if (pujada) esborraFitxer(pujada);
        avis(e && e.message && !e.code ? e.message : errorText(e), 'error');
        return false;
      } finally { botons.forEach(function (b) { b.disabled = false; }); }
    }
    async function esborra() {
      if (!confirma('Segur que vols esborrar «' + (fila.titol || fila.nom) + '»? No es pot desfer.')) return;
      var d = await escriu(sb.from(B.taula).delete().eq('id', fila.id));
      if (d) { if (F.foto) esborraFitxer(F.foto.actual()); esbEsborra(kEsb); avis('Esborrat.'); location.hash = '#/' + clau; }
    }

    var retorn = null;
    if (editable) {
      if (clau === 'noticies') {
        var estat = fila ? fila.estat : 'esborrany';
        botons.push(boto('Desa', 'o gran', function () { desa({ estat: fila ? fila.estat : 'esborrany' }, 'Desat.'); }));
        if (!editora && estat !== 'pendent') botons.push(boto('Envia a revisió', 'gran', function () { desa({ estat: 'pendent' }, 'Enviada a revisió.'); }));
        if (editora && estat !== 'publicat') botons.push(boto('Publica', 'v gran', function () { desa({ estat: 'publicat', nota_revisio: null }, 'Publicat. Ja es veu a la web.'); }));
        if (editora && estat === 'pendent') {
          var nota = el('textarea', { id: 'f-nota', maxlength: 1000, rows: 3 });
          retorn = el('div', { class: 'app-retorn', hidden: true }, [el('label', { for: 'f-nota', class: 'app-etiq' }, ['Què cal corregir? (ho veurà l’autor)']), nota,
            boto('Confirma el retorn', 'gran', function () {
              if (!nota.value.trim()) { avis('Escriu què cal corregir.', 'error'); nota.focus(); return; }
              desa({ estat: 'retornat', nota_revisio: nota.value.trim() }, 'Retornada a l’autor amb la nota.');
            })]);
          botons.push(boto('Retorna a l’autor', 'o gran', function () { retorn.hidden = !retorn.hidden; if (!retorn.hidden) nota.focus(); }));
        }
        if (editora && estat === 'publicat') botons.push(boto('Oculta', 'o gran', function () { desa({ estat: 'arxivat' }, 'Ocultada: ja no es veu a la web.'); }));
        if (fila && jo.rol === 'admin') botons.push(boto('Esborra', 'perill gran', esborra));
      } else {
        var pub = fila ? fila.publicada : false;
        botons.push(boto('Desa', 'o gran', function () { desa({}, 'Desat.'); }));
        botons.push(pub ? boto('Oculta', 'o gran', function () { desa({ publicada: false }, 'Ocultat: ja no es veu a la web.'); })
          : boto('Publica', 'v gran', function () { desa({ publicada: true }, 'Publicat. Ja es veu a la web.'); }));
        if (fila) botons.push(boto('Esborra', 'perill gran', esborra));
      }
    }
    var previ = el('section', { class: 'app-previ', hidden: true, 'aria-label': 'Vista prèvia' });
    var bPrevi = boto('Vista prèvia', 'o gran', function () {
      if (!previ.hidden) { previ.hidden = true; bPrevi.textContent = 'Vista prèvia'; return; }
      previ.textContent = ''; previ.appendChild(previsualitza(clau, F.valors(), F.foto));
      previ.hidden = false; bPrevi.textContent = 'Amaga la vista prèvia'; previ.scrollIntoView({ block: 'nearest' });
    });
    var titol = fila ? (fila.titol || fila.nom) : (B.nou || '').replace(/^\+ /, '');
    pinta(t, [
      el('a', { href: '#/' + clau, class: 'app-inici' }, ['← ' + B.titol]),
      el('h1', null, [titol]),
      fila && clau === 'noticies' ? el('p', null, [el('span', { class: 'app-estat ' + fila.estat }, [ESTATS[fila.estat]])]) : null,
      fila && clau === 'noticies' && fila.estat === 'retornat' && fila.nota_revisio ? el('p', { class: 'app-nota' }, ['Nota de revisió: ' + fila.nota_revisio]) : null,
      !editable ? el('p', { class: 'app-avis-esb' }, ['Ara no la pots modificar (està ' + (ESTATS[fila.estat] || '').toLowerCase() + '). Només la pots consultar.']) : null,
      avisEsb, form, el('div', { class: 'app-accions' }, [bPrevi].concat(botons)), retorn, previ
    ]);
  }
  function previsualitza(clau, v, foto) {
    var c = el('article', { class: 'app-previ-in' });
    var src = foto ? (foto.nova() ? URL.createObjectURL(foto.nova()) : (foto.treure() ? '' : imatgeUrl(foto.actual()))) : '';
    if (clau === 'noticies') {
      c.appendChild(el('p', { class: 'kicker' }, [v.tipus === 'comunicat' ? 'Comunicat' : 'Notícia']));
      c.appendChild(el('h2', null, [v.titol || '(sense títol)']));
      if (v.resum) c.appendChild(el('p', null, [el('strong', null, [v.resum])]));
      if (src) c.appendChild(el('img', { src: src, alt: '' }));
      var cos = el('div', { class: 'contingut' }); cos.appendChild(S.neteja(v.contingut || '')); c.appendChild(cos);
    } else {
      if (src) c.appendChild(el('img', { src: src, alt: '' }));
      c.appendChild(el('h2', null, [v.titol || v.nom || '(sense nom)']));
      ['quan', 'lloc', 'municipi', 'organisme', 'descripcio', 'organitza', 'web', 'url'].forEach(function (k) { if (v[k]) c.appendChild(el('p', null, [v[k]])); });
    }
    return c;
  }

  // ------------------------------------------------------------------ usuaris i perfil
  function vUsuari(t, u) {
    var soc = u.id === jo.id;
    var sel = el('select', { id: 'f-rol', disabled: soc, value: u.rol }, Object.keys(ROLS).map(function (k) { return el('option', { value: k }, [ROLS[k]]); }));
    pinta(t, [
      el('a', { href: '#/usuaris', class: 'app-inici' }, ['← Usuaris']),
      el('h1', null, [u.nom || u.email]),
      el('p', { class: 'app-meta' }, [u.email + ' · alta: ' + dataCurta(u.created_at)]),
      el('div', { class: 'app-camp' }, [el('label', { for: 'f-rol', class: 'app-etiq' }, ['Rol']), sel]),
      soc ? el('p', { class: 'app-meta' }, ['No pots canviar el teu propi rol ni desactivar el teu compte.']) : null,
      el('div', { class: 'app-accions' }, [
        boto('Desa el rol', 'v gran', async function () {
          if (await escriu(sb.from('profiles').update({ rol: sel.value }).eq('id', u.id))) { avis('Desat.'); encamina(); }
        }, { disabled: soc }),
        boto(u.actiu ? 'Desactiva el compte' : 'Activa el compte', u.actiu ? 'perill gran' : 'o gran', async function () {
          if (u.actiu && !confirma('Desactivar el compte de ' + (u.nom || u.email) + '? No podrà entrar, però el que ha escrit es conserva.')) return;
          if (await escriu(sb.from('profiles').update({ actiu: !u.actiu }).eq('id', u.id))) { avis(u.actiu ? 'Compte desactivat.' : 'Compte activat.'); encamina(); }
        }, { disabled: soc })
      ])
    ]);
  }
  function vConvida(t) {
    var fE = el('input', { id: 'f-email', type: 'email', required: true, maxlength: 254, autocomplete: 'off' });
    var fN = el('input', { id: 'f-nom', type: 'text', maxlength: 100, autocomplete: 'off' });
    var fR = el('select', { id: 'f-rol', value: 'col_laborador' }, Object.keys(ROLS).map(function (k) { return el('option', { value: k }, [ROLS[k]]); }));
    var b = el('button', { type: 'submit', class: 'app-btn v gran' }, ['Envia la invitació']);
    pinta(t, [
      el('a', { href: '#/usuaris', class: 'app-inici' }, ['← Usuaris']),
      el('h1', null, ['Convida una persona']),
      el('form', { class: 'app-form', novalidate: true, onsubmit: async function (e) {
        e.preventDefault();
        var email = fE.value.trim();
        if (!email || !fE.checkValidity()) { avis('Escriu un correu electrònic vàlid.', 'error'); fE.focus(); return; }
        b.disabled = true;
        try {
          var s = (await sb.auth.getSession()).data.session;
          if (!s) { avis('La sessió ha caducat. Torna a entrar.', 'error'); return; }
          var resp = await fetch('/api/convidar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
            body: JSON.stringify({ email: email, nom: fN.value.trim(), rol: fR.value }) });
          var j = await resp.json().catch(function () { return {}; });
          if (!resp.ok) { avis(j.error || 'No s’ha pogut enviar la invitació.', 'error'); return; }
          avis('Invitació enviada a ' + email + '.'); location.hash = '#/usuaris';
        } catch (x) { avis('No hi ha connexió. Torna-ho a provar.', 'error'); }
        finally { b.disabled = false; }
      } }, [
        el('div', { class: 'app-camp' }, [el('label', { for: 'f-email', class: 'app-etiq' }, ['Correu electrònic *']), fE]),
        el('div', { class: 'app-camp' }, [el('label', { for: 'f-nom', class: 'app-etiq' }, ['Nom']), fN]),
        el('div', { class: 'app-camp' }, [el('label', { for: 'f-rol', class: 'app-etiq' }, ['Rol']), fR]),
        el('p', { class: 'app-meta' }, ['Rebrà un correu per triar la seva contrasenya.']), b
      ])
    ]);
  }
  function vPerfil(t) {
    var p1 = el('input', { id: 'f-pw1', type: 'password', autocomplete: 'new-password', minlength: 10 });
    var p2 = el('input', { id: 'f-pw2', type: 'password', autocomplete: 'new-password', minlength: 10 });
    pinta(t, [
      tornaInici(),
      el('h1', null, ['El meu perfil']),
      el('dl', { class: 'app-dades' }, [el('dt', null, ['Nom']), el('dd', null, [jo.nom || '—']), el('dt', null, ['Correu']), el('dd', null, [jo.email]),
        el('dt', null, ['Rol']), el('dd', null, [ROLS[jo.rol] || jo.rol])]),
      caixaInstal(),
      el('h2', null, ['Canvia la contrasenya']),
      el('form', { class: 'app-form', novalidate: true, onsubmit: async function (e) {
        e.preventDefault();
        if (p1.value.length < 10) { avis('La contrasenya ha de tenir almenys 10 caràcters.', 'error'); p1.focus(); return; }
        if (p1.value !== p2.value) { avis('Les dues contrasenyes no coincideixen.', 'error'); p2.focus(); return; }
        var r = await sb.auth.updateUser({ password: p1.value });
        if (r.error) { avis(/same|different/i.test(r.error.message || '') ? 'La contrasenya nova ha de ser diferent de l’anterior.'
          : /weak|pwned|leaked/i.test(r.error.message || '') ? 'Aquesta contrasenya és massa feble. Tria’n una altra de més llarga.' : errorText(r.error), 'error'); return; }
        p1.value = ''; p2.value = ''; avis('Contrasenya canviada.');
      } }, [
        el('div', { class: 'app-camp' }, [el('label', { for: 'f-pw1', class: 'app-etiq' }, ['Contrasenya nova (mínim 10 caràcters)']), p1]),
        el('div', { class: 'app-camp' }, [el('label', { for: 'f-pw2', class: 'app-etiq' }, ['Repeteix-la']), p2]),
        el('button', { type: 'submit', class: 'app-btn gran' }, ['Canvia la contrasenya'])
      ]),
      el('div', { class: 'app-accions app-sortida' }, [boto('Tanca la sessió', 'perill gran', surt)])
    ]);
  }

  // ------------------------------------------------------------------ accés
  function vAcces(missatge) {
    torn++;
    qui.textContent = '';
    var fE = el('input', { id: 'a-email', type: 'email', autocomplete: 'username', required: true, maxlength: 254 });
    var fP = el('input', { id: 'a-pw', type: 'password', autocomplete: 'current-password', required: true });
    var b = el('button', { type: 'submit', class: 'app-btn v gran' }, ['Entra']);
    vista.textContent = '';
    [el('h1', null, ['Zona privada']), el('p', null, ['Accés per a les persones que col·laboren amb la iniciativa.']),
      missatge ? el('p', { class: 'app-avis-esb' }, [missatge]) : null,
      el('form', { class: 'app-form', novalidate: true, onsubmit: async function (e) {
        e.preventDefault();
        if (!fE.value.trim() || !fP.value) { avis('Escriu el correu i la contrasenya.', 'error'); return; }
        b.disabled = true;
        var r = await sb.auth.signInWithPassword({ email: fE.value.trim(), password: fP.value });
        b.disabled = false;
        if (r.error) {
          avis(r.error.code === 'invalid_credentials' || /Invalid login/i.test(r.error.message || '') ? 'Correu o contrasenya incorrectes.'
            : r.error.status === 429 ? 'Massa intents seguits. Espera uns minuts.' : esXarxa(r.error) ? 'No hi ha connexió. Torna-ho a provar.' : 'No s’ha pogut entrar.', 'error');
          return;
        }
        inicia();
      } }, [
        el('div', { class: 'app-camp' }, [el('label', { for: 'a-email', class: 'app-etiq' }, ['Correu electrònic']), fE]),
        el('div', { class: 'app-camp' }, [el('label', { for: 'a-pw', class: 'app-etiq' }, ['Contrasenya']), fP]), b
      ]),
      boto('He oblidat la contrasenya', 'enllac', async function () {
        var email = fE.value.trim();
        if (!email || !fE.checkValidity()) { avis('Escriu primer el teu correu a dalt.', 'error'); fE.focus(); return; }
        var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/area-privada/contrasenya.html' });
        avis(r.error ? 'No s’ha pogut enviar. Torna-ho a provar d’aquí a una estona.' : 'Si el correu és d’un compte, rebràs un enllaç per triar una contrasenya nova.', r.error ? 'error' : null);
      }),
      caixaInstal()
    ].forEach(function (n) { if (n) vista.appendChild(n); });
  }
  async function surt() {
    var r; try { r = await sb.auth.signOut(); } catch (e) { r = { error: e }; }
    if (r && r.error && esXarxa(r.error)) { avis('No hi ha connexió: no s’ha pogut tancar la sessió.', 'error'); return; }
    esbEsborraTots(); jo = null; vAcces('Has tancat la sessió.');
  }

  // ------------------------------------------------------------------ encaminador
  async function encamina() {
    if (!jo) return;
    var h = location.hash.replace(/^#\/?/, ''), q = h.split('?'), parts = q[0].split('/').filter(Boolean);
    var params = new URLSearchParams(q[1] || '');
    var t = ++torn;
    try {
      if (!parts.length) { document.title = 'Defensem Admin'; await vInici(t); }
      else if (parts[0] === 'perfil') { document.title = 'El meu perfil · Defensem Admin'; vPerfil(t); }
      else if (BLOCS[parts[0]]) {
        var B = BLOCS[parts[0]];
        if (!pot(B.rols)) { pinta(t, [tornaInici(), el('h1', null, ['No hi tens accés.'])]); return; }
        document.title = B.titol + ' · Defensem Admin';
        if (parts[1]) await vEdita(t, parts[0], parts[1]); else await vLlista(t, parts[0], params.get('p'));
      } else pinta(t, [tornaInici(), el('h1', null, ['No hem trobat aquesta secció.'])]);
    } catch (e) { pinta(t, [tornaInici(), el('p', { class: 'app-avis-esb error' }, [errorText(e)])]); }
    if (t === torn) { vista.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }

  async function inicia() {
    if (!sb) { vista.textContent = ''; vista.appendChild(el('p', { class: 'app-avis-esb error' }, ['La zona privada encara no està configurada.'])); return; }
    var s;
    try { s = (await sb.auth.getSession()).data.session; } catch (e) { s = null; }
    if (!s) { vAcces(); return; }
    var r = await sb.from('profiles').select('id,email,nom,rol,actiu').eq('id', s.user.id).maybeSingle();
    if (r.error && (r.status === 401 || /JWT/i.test(r.error.message || ''))) { await sb.auth.signOut().catch(function () {}); vAcces('La sessió ha caducat. Torna a entrar.'); return; }
    if (r.error) { vista.textContent = ''; vista.appendChild(el('p', { class: 'app-avis-esb error' }, [errorText(r.error)])); return; }
    if (!r.data || r.data.actiu !== true) { await sb.auth.signOut().catch(function () {}); vAcces('Aquest compte està desactivat.'); return; }
    jo = r.data;
    avis('');
    qui.textContent = (jo.nom || jo.email) + ' · ' + (ROLS[jo.rol] || jo.rol);
    encamina();
  }
  window.addEventListener('hashchange', encamina);
  if (sb) sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && jo) { jo = null; esbEsborraTots(); vAcces('La sessió s’ha tancat.'); } });
  inicia();
})();
