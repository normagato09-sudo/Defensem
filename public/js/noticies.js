/* Llistes de notícies. Cada contenidor <div class="news" data-seccio="…"> en pinta una:
     data-seccio      defensem (Notícies de Defensem) · renovables (Notícies d'energies renovables) · buit = totes
     data-per-carrega quantes en mostra (i quantes més afegeix «Carrega'n més»)
     data-projecte    opcional: només les relacionades amb aquest projecte (la-tallada · albons)
     data-buit        frase de la targeta «Pròximament» si no n'hi ha cap de publicada
     data-mes         opcional: id del botó «Carrega'n més» (paginació amb limit/offset a Supabase)
     data-totes       opcional: id de l'enllaç «Veure-les totes», que s'amaga si no n'hi ha cap
   - Si Supabase està configurat (js/config.js), es llegeixen de la vista pública publicacions_publiques
     (només contingut publicat; mai esborranys ni pendents). Si no, les de Defensem es llegeixen de /noticies.json.
   - Defensem: targeta amb imatge, data, títol i resum, que porta a noticia.html?id=…
   - Renovables: títol, mitjà, data, resum propi i «Llegeix-la a la font» (pestanya nova).
   - Les imatges es carreguen tard (lazy), amb mida fixada (sense salts). Si el projecte de Supabase té les
     transformacions d'imatge actives (plans de pagament), posa imatgesReduides: true a js/config.js. */
(function () {
  'use strict';
  var S = window.Segur, cfg = S && S.config();
  var SECCIONS = { defensem: 1, renovables: 1 }, PROJECTES = { 'la-tallada': 1, albons: 1 };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x) e.textContent = x; return e; }
  function dataText(d) {
    if (!d) return '';
    var x = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d);
    return isNaN(x) ? '' : x.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function imatge(n) {
    var i = document.createElement('img'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.width = 640; i.height = 360;
    i.src = n.imatgePetita || n.imatge;
    i.onerror = function () { if (n.imatgePetita && i.src.indexOf('/render/image/') !== -1) i.src = n.imatge; else i.remove(); };
    return i;
  }
  function data(n) { var tm = el('time', '', dataText(n.data)); tm.setAttribute('datetime', n.data); return tm; }
  function targetaDefensem(n) {
    var c = el('article', 'card card-compacta'), im = el('div', 'im');
    if (n.imatge) im.appendChild(imatge(n));
    c.appendChild(im);
    var t = el('div', 'tx');
    if (n.etiqueta) t.appendChild(el('span', 'etiq', n.etiqueta));
    if (n.data) t.appendChild(data(n));
    var h = el('h3');
    if (n.enllac) { var a = el('a', '', n.titol || ''); a.href = n.enllac; if (/^https?:/.test(n.enllac)) { a.target = '_blank'; a.rel = 'noopener'; } h.appendChild(a); }
    else h.textContent = n.titol || '';
    t.appendChild(h);
    if (n.resum) t.appendChild(el('p', 'resum-2', n.resum));
    c.appendChild(t);
    return c;
  }
  function targetaRenovable(n) {
    var c = el('article', 'card renovable'), t = el('div', 'tx');
    var font = S.enllac(n.font_url || '');
    if (n.mitja) t.appendChild(el('span', 'mitja', n.mitja));
    if (n.data) t.appendChild(data(n));
    t.appendChild(el('h3', '', n.titol || ''));
    if (n.resum) t.appendChild(el('p', '', n.resum));
    if (font) {
      var a = el('a', 'font', 'Llegeix-la a la font'); a.href = font; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', 'Llegeix «' + (n.titol || '') + '» a la font' + (n.mitja ? ', ' + n.mitja : '') + ' (s’obre en una pestanya nova)');
      t.appendChild(a);
    }
    c.appendChild(t);
    return c;
  }
  function deSupabase(n) {
    var gran = S.urlImatge(null, n.imatge);
    return { seccio: n.seccio || 'defensem', titol: n.titol, resum: n.resum, mitja: n.mitja, font_url: n.font_url,
      data: n.data || n.published_at || '', imatge: gran,
      imatgePetita: gran && window.DEFENSEM && window.DEFENSEM.imatgesReduides ? gran.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?width=640&quality=70' : '',
      etiqueta: n.tipus === 'comunicat' ? 'Comunicat' : '', enllac: '/noticia.html?id=' + n.id };
  }

  function llista(box) {
    var seccio = SECCIONS[box.getAttribute('data-seccio')] ? box.getAttribute('data-seccio') : '';
    var projecte = PROJECTES[box.getAttribute('data-projecte')] ? box.getAttribute('data-projecte') : '';
    var PER = parseInt(box.getAttribute('data-per-carrega'), 10) || 6;
    var frase = box.getAttribute('data-buit') || 'Aviat hi trobareu les notícies.';
    var mes = document.getElementById(box.getAttribute('data-mes') || '');
    var totes = document.getElementById(box.getAttribute('data-totes') || '');
    var carregades = 0, total = 0, json = null;

    function afegeix(l) {
      if (!carregades) box.textContent = '';
      l.forEach(function (n) { box.appendChild(n.seccio === 'renovables' ? targetaRenovable(n) : targetaDefensem(n)); });
      carregades += l.length;
      if (!carregades) box.appendChild(S.proximament(frase, !!projecte));
      if (mes) mes.hidden = carregades >= total;
      if (totes) totes.hidden = !carregades;
    }
    function deJson() {
      if (seccio === 'renovables' || projecte) return Promise.resolve().then(function () { total = 0; afegeix([]); });
      var p = json ? Promise.resolve(json) : fetch('/noticies.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (l) {
        if (!Array.isArray(l)) l = [];
        l.sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
        json = l; return l;
      });
      return p.then(function (l) {
        total = l.length;
        afegeix(l.slice(carregades, carregades + PER).map(function (n) {
          return { seccio: 'defensem', titol: n.titol, resum: n.descripcio, enllac: n.enllac, imatge: n.imatge, data: n.data };
        }));
      });
    }
    function deSb() {
      var q = 'publicacions_publiques?select=id,tipus,titol,resum,imatge,published_at,seccio,mitja,font_url,data,projecte' +
        (seccio ? '&seccio=eq.' + seccio : '') + (projecte ? '&projecte=eq.' + projecte : '') +
        '&order=data.desc,published_at.desc&limit=' + PER + '&offset=' + carregades;
      return S.llegeix(q, true).then(function (r) {
        total = r.total != null ? r.total : carregades + r.files.length + (r.files.length === PER ? 1 : 0);
        afegeix(r.files.filter(function (n) { return S.esUuid(n.id); }).map(deSupabase));
      });
    }
    var carrega = cfg ? function () { return deSb().catch(function () { if (!carregades) return deJson(); }); } : deJson;
    carrega().catch(function () { box.textContent = ''; box.appendChild(S.proximament(frase, !!projecte)); if (totes) totes.hidden = true; });
    if (mes) mes.addEventListener('click', function () {
      mes.disabled = true;
      var abans = box.children.length;
      carrega().catch(function () {}).then(function () {
        mes.disabled = false;
        var nou = box.children[abans]; if (nou) { var a = nou.querySelector('a'); if (a) a.focus(); }
      });
    });
  }
  if (!S) return;
  Array.prototype.forEach.call(document.querySelectorAll('.news[data-seccio]'), llista);
})();
