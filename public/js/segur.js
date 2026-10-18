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

  window.Segur = {
    neteja: neteja, serialitza: serialitza, html: escapa, dataCurta: dataCurta,
    urlImatge: urlImatge, config: config, enllac: enllac,
    esUuid: function (s) { return typeof s === 'string' && UUID.test(s); }
  };
})();
