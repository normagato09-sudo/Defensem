/* Consentiment de cookies i tecnologies opcionals (web pública).
   Sense cookies, sense rastrejadors i sense dependències: la decisió es desa al localStorage del navegador.

   QUÈ FA
   - La primera vegada mostra un bàner fix a baix (Rebutjar / Configurar / Acceptar, amb el mateix pes visual).
   - «Configurar» i l'enllaç «Preferències de cookies» del peu obren el mateix panell de categories.
   - Desa { versio, data, categories } a localStorage['defensem.consentiment']. Si VERSIO canvia, es torna a demanar.
   - No es mostra a /area-privada/ (allà, a més, no s'inclou aquest fitxer).

   AVUI NO HI HA CAP SCRIPT OPCIONAL: aquest mòdul no en carrega cap. Està preparat perquè, si mai se n'afegeix un
   (analítica, vídeo, mapa…), NOMÉS es carregui amb consentiment.

   API (window.consentiment)
   - consentiment.te(categoria) → true/false. Categories: 'necessaries' (sempre true) i 'analitiques'
     (analítiques i contingut extern: vídeos, mapes, xarxes incrustades…). Sense decisió, tot l'opcional és false.
   - consentiment.decidit() → true si la persona ja ha triat (amb la VERSIO actual).
   - consentiment.obre([elementQueElObre]) → obre el panell de preferències.
   - Esdeveniment 'consentiment:canvi' a document, cada vegada que es desa una decisió.
     e.detail = { versio, data, categories: { necessaries: true, analitiques: true|false } }

   COM AFEGIR UN SCRIPT OPCIONAL (exemple, NO actiu):
     <script src="/js/consentiment.js" defer></script>   ← sempre abans dels scripts que en depenen
     <script src="/js/video.js" defer></script>
     // video.js
     (function () {
       var fet = false;
       function carrega() {
         if (fet || !consentiment.te('analitiques')) return;
         fet = true;
         // aquí, i només aquí, es crea l'<iframe> o el <script> de tercers
       }
       carrega();
       document.addEventListener('consentiment:canvi', carrega);
     })();
   Regles: mai no posis directament a l'HTML un <script src> o un <iframe> de tercers; mentre no hi hagi
   consentiment mostra un substitut amb un botó que cridi consentiment.obre(). Si es retira el consentiment,
   el script ha de deixar de funcionar (el més senzill: location.reload() en rebre 'consentiment:canvi' amb false).
   Per afegir una categoria: afegeix-la a CATEGORIES i al panell, actualitza cookies.html i
   preferencies-cookies.html i puja VERSIO (així es torna a demanar a tothom). */
(function () {
  'use strict';
  var CLAU = 'defensem.consentiment';
  var VERSIO = '1';                 // puja-la quan canviïn les categories o el text del bàner
  var CATEGORIES = ['analitiques']; // opcionals; 'necessaries' sempre és true
  var PREFERENCIES = '/preferencies-cookies.html';
  var privada = /^\/area-privada(\/|$)/.test(location.pathname);
  var memoria = null;               // per si el localStorage no està disponible (navegació privada estricta, etc.)

  function llegeix() {
    var d = null;
    try { var t = localStorage.getItem(CLAU); if (t) d = JSON.parse(t); } catch (e) { d = null; }
    if (!d) d = memoria;
    if (!d || d.versio !== VERSIO || !d.categories || typeof d.categories !== 'object') return null;
    return d;
  }

  function categories(d) {
    var c = { necessaries: true };
    CATEGORIES.forEach(function (k) { c[k] = !!(d && d.categories[k] === true); });
    return c;
  }

  function desa(tria) {
    var c = {};
    CATEGORIES.forEach(function (k) { c[k] = !!tria[k]; });
    var d = { versio: VERSIO, data: new Date().toISOString(), categories: c };
    memoria = d;
    try { localStorage.setItem(CLAU, JSON.stringify(d)); } catch (e) { /* es manté en memòria durant la visita */ }
    amagaBanner();
    pintaEstat();
    avisa('S’han desat les teves preferències de cookies.');
    document.dispatchEvent(new CustomEvent('consentiment:canvi', { detail: { versio: d.versio, data: d.data, categories: categories(d) } }));
  }

  // ---------- DOM ----------
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  var banner = null, panell = null, estat = null, obridor = null;

  function avisa(text) {
    if (!estat) { estat = el('<p class="cc-sr" role="status"></p>'); document.body.appendChild(estat); }
    estat.textContent = '';
    setTimeout(function () { estat.textContent = text; }, 50);
  }

  function mostraBanner() {
    if (banner || privada) return;
    banner = el(
      '<div class="cc-banner" role="dialog" aria-modal="false" aria-labelledby="cc-titol" aria-describedby="cc-text">' +
        '<div class="w cc-dins">' +
          '<div class="cc-msg">' +
            '<h2 id="cc-titol" class="cc-titol">Cookies</h2>' +
            '<p id="cc-text">Aquest web només fa servir tecnologies estrictament necessàries. Si en el futur n’afegim d’altres, et demanarem el consentiment. <a href="/cookies.html">Més informació</a></p>' +
          '</div>' +
          '<div class="cc-botons">' +
            '<button type="button" class="cc-btn" data-cc="rebutjar">Rebutjar</button>' +
            '<button type="button" class="cc-btn" data-cc="configurar" aria-haspopup="dialog">Configurar</button>' +
            '<button type="button" class="cc-btn" data-cc="acceptar">Acceptar</button>' +
          '</div>' +
        '</div>' +
      '</div>');
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cc]');
      if (!b) return;
      var a = b.getAttribute('data-cc'), tot = {};
      if (a === 'configurar') return obre(b);
      CATEGORIES.forEach(function (k) { tot[k] = a === 'acceptar'; });
      desa(tot);
    });
    // Primer al DOM perquè amb el teclat s'hi arribi de seguida; visualment va fix a baix.
    document.body.insertBefore(banner, document.body.firstChild);
    document.documentElement.classList.add('cc-actiu');
    // Reserva l'alçada del bàner al final de la pàgina perquè no tapi res (ni el peu ni els botons).
    var ajusta = function () { if (banner) document.documentElement.style.setProperty('--cc-alt', banner.offsetHeight + 'px'); };
    ajusta();
    if (window.ResizeObserver) new ResizeObserver(ajusta).observe(banner); else window.addEventListener('resize', ajusta);
  }

  function amagaBanner() {
    if (!banner) return;
    if (banner.contains(document.activeElement)) document.activeElement.blur();
    banner.remove(); banner = null;
    document.documentElement.classList.remove('cc-actiu');
    document.documentElement.style.removeProperty('--cc-alt');
  }

  function creaPanell() {
    panell = el(
      '<dialog class="cc-panell" aria-labelledby="cc-p-titol" aria-describedby="cc-p-intro">' +
        '<div class="cc-p-cap">' +
          '<h2 id="cc-p-titol" class="cc-titol" tabindex="-1">Preferències de cookies</h2>' +
          '<button type="button" class="cc-tanca" aria-label="Tancar sense desar">×</button>' +
        '</div>' +
        '<p id="cc-p-intro">Tria què pot fer servir aquest web al teu navegador. Pots canviar-ho quan vulguis des de l’enllaç «Preferències de cookies» del peu.</p>' +
        '<div class="cc-cat">' +
          '<div class="cc-fila"><h3 id="cc-nec-t">Necessàries</h3>' +
            '<span class="cc-sempre" id="cc-nec-s">Sempre actives</span>' +
            '<button type="button" role="switch" class="cc-switch" aria-checked="true" aria-disabled="true" aria-labelledby="cc-nec-t" aria-describedby="cc-nec-s cc-nec-d"><span></span></button>' +
          '</div>' +
          '<p id="cc-nec-d">Permeten que el web funcioni i no es poden desactivar: desar aquesta mateixa elecció al teu navegador i, només si entres a l’àrea privada, mantenir-hi la sessió iniciada. No fan cap seguiment ni es comparteixen amb tercers.</p>' +
        '</div>' +
        '<div class="cc-cat">' +
          '<div class="cc-fila"><h3 id="cc-an-t">Analítiques / contingut extern</h3>' +
            '<button type="button" role="switch" class="cc-switch" id="cc-analitiques" data-cat="analitiques" aria-checked="false" aria-labelledby="cc-an-t" aria-describedby="cc-an-d"><span></span></button>' +
          '</div>' +
          '<p id="cc-an-d">Mesura d’audiència i continguts d’altres webs incrustats (vídeos, mapes, xarxes socials). Ara mateix aquest web no en fa servir cap: si mai n’hi afegim, no es carregaran sense el teu permís.</p>' +
        '</div>' +
        '<div class="cc-p-peu"><button type="button" class="cc-btn" data-cc="desar">Desar preferències</button></div>' +
      '</dialog>');
    document.body.appendChild(panell);
    panell.addEventListener('click', function (e) {
      if (e.target.closest('.cc-tanca')) return tanca();
      var sw = e.target.closest('[role="switch"][data-cat]');
      if (sw) { sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); return; }
      if (e.target.closest('[data-cc="desar"]')) {
        var tria = {};
        panell.querySelectorAll('[data-cat]').forEach(function (i) { tria[i.getAttribute('data-cat')] = i.getAttribute('aria-checked') === 'true'; });
        tanca(); desa(tria);
      }
    });
    // Escape tanca (gestionat aquí perquè el focus torni on era); Tab queda atrapat dins el panell.
    panell.addEventListener('cancel', function (e) { e.preventDefault(); tanca(); });
    panell.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); tanca(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(panell.querySelectorAll('button, a[href]'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var primer = f[0], darrer = f[f.length - 1], ara = document.activeElement;
      if (e.shiftKey && (ara === primer || !panell.contains(ara) || ara === panell.querySelector('#cc-p-titol'))) { e.preventDefault(); darrer.focus(); }
      else if (!e.shiftKey && ara === darrer) { e.preventDefault(); primer.focus(); }
    });
  }

  function obre(origen) {
    if (privada) return;
    if (!panell) creaPanell();
    obridor = origen || document.activeElement;
    var c = categories(llegeix());
    panell.querySelectorAll('[data-cat]').forEach(function (i) { i.setAttribute('aria-checked', String(c[i.getAttribute('data-cat')])); });
    if (typeof panell.showModal === 'function') { if (!panell.open) panell.showModal(); } else panell.setAttribute('open', '');
    panell.querySelector('#cc-p-titol').focus();
  }

  function tanca() {
    if (!panell) return;
    if (typeof panell.close === 'function' && panell.open) panell.close(); else panell.removeAttribute('open');
    var o = obridor; obridor = null;
    if (o && document.contains(o) && typeof o.focus === 'function') o.focus();
  }

  // Estat a la pàgina de preferències (element #cc-estat), si n'hi ha.
  function pintaEstat() {
    var e = document.getElementById('cc-estat');
    if (!e) return;
    var d = llegeix();
    if (!d) { e.textContent = 'Encara no has triat. Només funcionen les tecnologies necessàries.'; return; }
    var data = new Date(d.data);
    e.textContent = 'Analítiques / contingut extern: ' + (d.categories.analitiques ? 'acceptades' : 'rebutjades') +
      '. Decisió desada el ' + data.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  }

  function inicia() {
    if (privada) return;
    // Enllaç «Preferències de cookies» (peu i pàgina de preferències): obre el panell. Sense JS, porta a la pàgina.
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href="' + PREFERENCIES + '"], [data-cc="obre"]');
      if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      obre(a);
    });
    pintaEstat();
    if (!llegeix()) mostraBanner();
  }

  window.consentiment = Object.freeze({
    te: function (cat) { return cat === 'necessaries' ? true : categories(llegeix())[cat] === true; },
    decidit: function () { return !!llegeix(); },
    obre: function (origen) { if (document.body) obre(origen); },
    VERSIO: VERSIO,
    CLAU: CLAU
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();
})();
