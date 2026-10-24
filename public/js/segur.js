/* Utilitats de seguretat compartides per la web pública i l'àrea privada.
   Segur.neteja(html): converteix HTML no fiable en un DocumentFragment amb NOMÉS etiquetes permeses.
   El contingut de les publicacions es neteja SEMPRE en mostrar-lo, també a la web pública. */
(function () {
  var PERMESES = { P: 1, BR: 1, STRONG: 1, EM: 1, UL: 1, OL: 1, LI: 1, H2: 1, H3: 1, BLOCKQUOTE: 1, A: 1 };
  var ALIES = { B: 'STRONG', I: 'EM', DIV: 'P' };
  var DESCARTA = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, NOSCRIPT: 1, SVG: 1, MATH: 1,
    HEAD: 1, TITLE: 1, META: 1, LINK: 1, BASE: 1, FRAME: 1, FRAMESET: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1, INPUT: 1 };
  var IMATGE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Enllaç segur: només http(s) i mailto. Retorna l'adreça normalitzada o ''.
  function enllac(h) {
    h = (h || '').trim();
    if (!/^(https?:\/\/|mailto:)/i.test(h)) return '';
    try {
      var u = new URL(h);
      return (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') ? u.href : '';
    } catch (e) { return ''; }
  }

  function copia(origen, desti, fons) {
    if (fons > 60) { desti.appendChild(document.createTextNode(origen.textContent || '')); return; }
    for (var c = origen.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { desti.appendChild(document.createTextNode(c.nodeValue)); continue; }
      if (c.nodeType !== 1) continue; // comentaris, etc.
      var t = c.nodeName.toUpperCase();
      t = ALIES[t] || t;
      if (DESCARTA[t]) continue;
      if (!PERMESES[t]) { copia(c, desti, fons + 1); continue; } // es desembolica i es conserva el text
      if (t === 'A') {
        var href = enllac(c.getAttribute('href'));
        if (!href) { copia(c, desti, fons + 1); continue; }
        var a = document.createElement('a');
        a.setAttribute('href', href);
        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('target', '_blank');
        copia(c, a, fons + 1);
        desti.appendChild(a);
        continue;
      }
      var e = document.createElement(t.toLowerCase());
      if (t !== 'BR') copia(c, e, fons + 1);
      desti.appendChild(e);
    }
  }

  function neteja(html) {
    var frag = document.createDocumentFragment();
    if (typeof html !== 'string' || !html) return frag;
    // DOMParser crea un document inert: no executa scripts ni carrega imatges.
    var doc = new DOMParser().parseFromString(html, 'text/html');
    copia(doc.body, frag, 0);
    return frag;
  }

  // HTML net com a text (per desar-lo a la base de dades).
  function serialitza(html) {
    var d = document.createElement('div');
    d.appendChild(neteja(html));
    return d.innerHTML;
  }

  function escapa(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dataCurta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Configuració de Supabase vàlida o null.
  function config(cfg) {
    cfg = cfg || window.DEFENSEM || {};
    var url = (cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
    var key = (cfg.supabaseAnonKey || '').trim();
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(url) || !key) return null;
    return { url: url, key: key };
  }

  function urlImatge(cfg, cami) {
    var c = config(cfg);
    if (!c || typeof cami !== 'string' || !IMATGE.test(cami)) return '';
    return c.url + '/storage/v1/object/public/portades/' + cami;
  }

  // PDF de la secció Informació: fitxer del bucket «informacio» o un dels PDF de la web (/docs/…).
  var PDF = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/, PDF_WEB = /^\/docs\/[a-z0-9-]{1,100}\.pdf$/;
  function urlPdf(cfg, cami) {
    if (typeof cami !== 'string') return '';
    if (PDF_WEB.test(cami)) return cami;
    var c = config(cfg);
    return c && PDF.test(cami) ? c.url + '/storage/v1/object/public/informacio/' + cami : '';
  }

  // Lectura pública de Supabase (només el que deixen veure les polítiques RLS). Retorna una promesa amb la llista
  // i, si es demana, el total (capçalera content-range). Falla si no hi ha configuració o la resposta no és bona.
  function llegeix(cami, ambTotal) {
    var c = config();
    if (!c) return Promise.reject(new Error('sense configuració'));
    var h = { apikey: c.key, Authorization: 'Bearer ' + c.key };
    if (ambTotal) h.Prefer = 'count=exact';
    return fetch(c.url + '/rest/v1/' + cami, { headers: h }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
      return r.json().then(function (l) {
        if (!Array.isArray(l)) throw new Error('resposta no vàlida');
        return ambTotal ? { files: l, total: m ? parseInt(m[1], 10) : null } : l;
      });
    });
  }

  // Text pla en paràgrafs (una línia en blanc separa paràgrafs; un salt simple es manté).
  function paragrafs(text) {
    var frag = document.createDocumentFragment();
    String(text || '').split(/\n\s*\n/).forEach(function (t) {
      t = t.trim(); if (!t) return;
      var p = document.createElement('p');
      t.split('\n').forEach(function (l, i) { if (i) p.appendChild(document.createElement('br')); p.appendChild(document.createTextNode(l)); });
      frag.appendChild(p);
    });
    return frag;
  }

  // Targeta «Pròximament» amb la identitat Defensem, per a qualsevol pàgina o bloc sense contingut publicat.
  function proximament(frase, petita) {
    var d = document.createElement('div'), k = document.createElement('p'), t = document.createElement('p');
    d.className = 'proximament' + (petita ? ' petita' : '');
    k.className = 'prox-k'; k.textContent = 'Pròximament';
    t.className = 'prox-t'; t.textContent = frase;
    d.appendChild(k); d.appendChild(t);
    return d;
  }

  window.Segur = {
    neteja: neteja, serialitza: serialitza, html: escapa, dataCurta: dataCurta,
    urlImatge: urlImatge, urlPdf: urlPdf, config: config, enllac: enllac,
    llegeix: llegeix, paragrafs: paragrafs, proximament: proximament,
    esUuid: function (s) { return typeof s === 'string' && UUID.test(s); }
  };
})();
