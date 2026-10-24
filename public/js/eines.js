/* Eines (/eines.html): visors oficials públics per analitzar el territori.

   COM EDITAR LA LLISTA
   Cada visor és un objecte dins d'EINES:
     { nom: '', organisme: '', descripcio: '', url: 'https://…', categoria: 'urbanisme' | 'energia' | 'paisatge' | 'medi_natural',
       incrustable: false }
   - Afegeix-hi NOMÉS adreces comprovades (que s'obren i són la pàgina oficial del visor).
     Per comprovar-les: node proves/verifica-eines.mjs (diu si cada URL respon i si permet incrustar-la).
   - incrustable: true només si l'organisme permet mostrar el visor dins d'un <iframe> (sense X-Frame-Options ni
     frame-ancestors que ho impedeixin). Llavors surt el botó «Veure aquí». Com que és contingut d'un altre web,
     només es carrega si la persona ha acceptat el contingut extern al panell de cookies.
     Cal afegir també l'origen del visor a frame-src de la Content-Security-Policy de vercel.json.

   Les propostes de sota NO s'han pogut verificar (des de l'entorn on s'ha preparat aquesta pàgina no hi havia
   accés a aquests webs). Comprova-les i, si funcionen, treu-les del comentari. */
var EINES = [
  // PENDENT DE VERIFICAR
  // { nom: 'Mapa urbanístic de Catalunya (MUC)', organisme: 'Generalitat de Catalunya · Departament de Territori',
  //   descripcio: 'Síntesi del planejament urbanístic general vigent de tots els municipis: classificació i qualificació del sòl.',
  //   url: 'https://dtes.gencat.cat/muc-visor/AppJava/home.do', categoria: 'urbanisme', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Registre de planejament urbanístic de Catalunya (RPUC)', organisme: 'Generalitat de Catalunya · Departament de Territori',
  //   descripcio: 'Consulta dels expedients de planejament urbanístic (plans, modificacions i documents aprovats) de cada municipi.',
  //   url: 'https://dtes.gencat.cat/rpucweb/AppJava/cercaExpedient.do', categoria: 'urbanisme', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Cartografia del Cadastre', organisme: 'Direcció General del Cadastre (Govern d’Espanya)',
  //   descripcio: 'Parcel·les cadastrals, referències i ortofotos per localitzar finques concretes.',
  //   url: 'https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx', categoria: 'urbanisme', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'VISSIR', organisme: 'Institut Cartogràfic i Geològic de Catalunya (ICGC)',
  //   descripcio: 'Visor de la geoinformació oficial de Catalunya: mapes base, ortofotos i més d’un centenar de capes temàtiques.',
  //   url: 'https://www.icgc.cat/ca/Eines-i-visors/Visors/VISSIR', categoria: 'paisatge', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Instamaps', organisme: 'Institut Cartogràfic i Geològic de Catalunya (ICGC)',
  //   descripcio: 'Plataforma per fer mapes propis combinant la geoinformació oficial de Catalunya amb dades pròpies.',
  //   url: 'https://www.instamaps.cat/', categoria: 'paisatge', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Catàleg de paisatge de les Comarques Gironines', organisme: 'Observatori del Paisatge de Catalunya',
  //   descripcio: 'Unitats de paisatge, valors i objectius de qualitat paisatgística de les comarques gironines.',
  //   url: 'https://www.catpaisatge.net/', categoria: 'paisatge', incrustable: false },

  // PENDENT DE VERIFICAR (confirmar l'adreça actual del «Visor ambiental d'energies renovables»)
  // { nom: 'Visor ambiental d’energies renovables', organisme: 'Generalitat de Catalunya',
  //   descripcio: 'Projectes eòlics i fotovoltaics en tramitació i condicionants ambientals del territori.',
  //   url: 'https://…', categoria: 'energia', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Zonificació ambiental per a energies renovables', organisme: 'Ministeri per a la Transició Ecològica (MITECO)',
  //   descripcio: 'Índex de sensibilitat ambiental del territori per a grans parcs eòlics i fotovoltaics (orientatiu).',
  //   url: 'https://www.miteco.gob.es/ca/calidad-y-evaluacion-ambiental/temas/evaluacion-ambiental/zonificacion_ambiental_energias_renovables.html',
  //   categoria: 'energia', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Geoportal del MITECO', organisme: 'Ministeri per a la Transició Ecològica (MITECO)',
  //   descripcio: 'Visor estatal amb capes d’evaluació ambiental, espais protegits, aigües i zonificació de renovables.',
  //   url: 'https://sig.mapama.gob.es/geoportal/', categoria: 'medi_natural', incrustable: false },

  // PENDENT DE VERIFICAR (confirmar l'adreça de l'Hipermapa o del visor d'espais naturals protegits)
  // { nom: 'Espais naturals protegits (PEIN i Xarxa Natura 2000)', organisme: 'Generalitat de Catalunya',
  //   descripcio: 'Límits dels espais d’interès natural i de la Xarxa Natura 2000.',
  //   url: 'https://…', categoria: 'medi_natural', incrustable: false },

  // PENDENT DE VERIFICAR
  // { nom: 'Visor de l’Agència Catalana de l’Aigua', organisme: 'Agència Catalana de l’Aigua (ACA)',
  //   descripcio: 'Zones inundables, aqüífers i informació hidrològica.',
  //   url: 'https://sig.aca.gencat.cat/visor/', categoria: 'medi_natural', incrustable: false },
];

(function () {
  'use strict';
  var CATEGORIES = { urbanisme: 'Urbanisme', energia: 'Energia', paisatge: 'Paisatge', medi_natural: 'Medi natural' };
  var llista = document.getElementById('eines-llista'), filtre = document.getElementById('eines-filtre');
  var visor = document.getElementById('eines-visor'), marc = document.getElementById('eines-visor-marc');
  var visorTitol = document.getElementById('eines-visor-titol');
  if (!llista) return;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function segura(u) {
    try { var x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; }
  }
  var eines = (Array.isArray(window.EINES) ? window.EINES : []).filter(function (e) {
    return e && e.nom && CATEGORIES[e.categoria] && segura(e.url);
  });

  if (!eines.length) {
    llista.textContent = '';
    llista.appendChild(el('p', 'buit', 'Estem comprovant els visors oficials abans de publicar-los. Aviat els hi trobareu.'));
    return;
  }

  var actiu = '', tornaFocus = null;
  function tancaVisor() {
    marc.textContent = ''; visor.hidden = true;
    if (tornaFocus) { tornaFocus.focus(); tornaFocus = null; }
  }
  document.getElementById('eines-visor-tanca').addEventListener('click', tancaVisor);

  function veureAqui(e, boto) {
    var c = window.consentiment;
    tornaFocus = boto;
    marc.textContent = '';
    visorTitol.textContent = e.nom;
    if (!c || !c.te('analitiques')) {
      var p = el('div', 'buit');
      p.appendChild(el('p', null, 'Per veure el visor aquí cal acceptar el contingut extern (és un web d’un altre organisme). També el pots obrir en una pestanya nova.'));
      if (c) {
        var b = el('button', 'btn o', 'Preferències de cookies'); b.type = 'button';
        b.addEventListener('click', function () { c.obre(b); });
        p.appendChild(b);
      }
      marc.appendChild(p);
    } else {
      var f = document.createElement('iframe');
      f.src = segura(e.url); f.title = e.nom + ' (' + e.organisme + ')'; f.loading = 'lazy';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
      marc.appendChild(f);
    }
    visor.hidden = false;
    visor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.addEventListener('consentiment:canvi', function () {
    if (!visor.hidden && tornaFocus) { var e = tornaFocus._eina; if (e) veureAqui(e, tornaFocus); }
  });

  function targeta(e) {
    var c = el('article', 'card eina');
    var tx = el('div', 'tx');
    tx.appendChild(el('span', 'etiq', CATEGORIES[e.categoria]));
    tx.appendChild(el('h3', null, e.nom));
    if (e.organisme) tx.appendChild(el('p', 'eina-org', e.organisme));
    tx.appendChild(el('p', null, e.descripcio || ''));
    var acc = el('div', 'eina-accions');
    var a = el('a', 'btn', 'Obre el visor');
    a.href = segura(e.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Obre ' + e.nom + ' (s’obre en una pestanya nova)');
    acc.appendChild(a);
    if (e.incrustable === true) {
      var b = el('button', 'btn o', 'Veure aquí'); b.type = 'button'; b._eina = e;
      b.setAttribute('aria-label', 'Veure ' + e.nom + ' en aquesta pàgina');
      b.addEventListener('click', function () { veureAqui(e, b); });
      acc.appendChild(b);
    }
    tx.appendChild(acc);
    c.appendChild(tx);
    return c;
  }

  function pinta() {
    llista.textContent = '';
    eines.filter(function (e) { return !actiu || e.categoria === actiu; }).forEach(function (e) { llista.appendChild(targeta(e)); });
    Array.prototype.forEach.call(filtre.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.value === actiu));
    });
  }

  var presents = {};
  eines.forEach(function (e) { presents[e.categoria] = 1; });
  [''].concat(Object.keys(CATEGORIES).filter(function (k) { return presents[k]; })).forEach(function (k) {
    var b = el('button', 'filtre-btn', k ? CATEGORIES[k] : 'Totes'); b.type = 'button'; b.value = k;
    b.addEventListener('click', function () { actiu = k; pinta(); });
    filtre.appendChild(b);
  });
  filtre.hidden = false;
  pinta();
})();
