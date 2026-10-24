/* Fora molins! — minijoc per a la web de Defensem l'Empordanet.
   Sense dependències. S'activa sobre qualsevol element amb l'atribut [data-fora-molins].
   Els gràfics són a la carpeta indicada a data-assets (per defecte "fora-molins/assets/"). */
(function () {
  'use strict';

  var root = document.querySelector('[data-fora-molins]');
  if (!root) return;

  // ------------------------------------------------------------------ configuració
  var ASSETS = root.getAttribute('data-assets') || 'fora-molins/assets/';
  var VERSIO = '11';   // puja-ho quan canviïn els gràfics o els sons, perquè el navegador no faci servir els vells
  var W = 1440, H = 1200, HOR = 600;
  var DURADA = 40;                 // segons per partida
  var HFULL = 526, BL = 290;       // alçada de la torre i llargada de pala (fila del davant)
  var CLAU_REC = 'defensem.foramolins.punts', CLAU_SO = 'defensem.foramolins.so';
  // Els molins brollen a l'atzar dins la plana. La mida depèn de la profunditat (perspectiva).
  var Y_FONS = 690, Y_DAVANT = 1025, MAX_CONSTRUITS = 10, DUR_ENFONSA = 0.6;
  function escala(y) { return lerp(0.5, 0.98, clamp((y - Y_FONS) / (Y_DAVANT - Y_FONS), 0, 1)); }

  var $ = function (sel) { return root.querySelector(sel); };
  var escenari = $('.fm-escenari'), tela = $('.fm-tela'), ctx = tela.getContext('2d');
  var ui = {
    hud: $('[data-hud]'), punts: $('[data-punts]'), temps: $('[data-temps]'), barra: $('[data-barra]'),
    inici: $('[data-inici]'), final: $('[data-final]'), juga: $('[data-juga]'), torna: $('[data-torna]'),
    comparteix: $('[data-comparteix]'), so: $('[data-so]'), anunci: $('[data-anunci]'), recInici: $('[data-rec-inici]'),
    fPunts: $('[data-f-punts]'), fAturats: $('[data-f-aturats]'), fConstruits: $('[data-f-construits]'), fRec: $('[data-f-rec]'), fFrase: $('[data-f-frase]')
  };
  // "Reduir animacions" del sistema: només treu les sacsejades de pantalla; el vent i els núvols es mouen igual
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ utilitats
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeBack(t) { var s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function llegeix(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function desa(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sense emmagatzematge */ } }
  function anuncia(t) { if (ui.anunci) ui.anunci.textContent = t; }

  // ------------------------------------------------------------------ càrrega de gràfics
  var IMG = {}, MAN = null, carregat = false;
  function carrega() {
    return fetch(ASSETS + 'manifest.json?v=' + VERSIO).then(function (r) { return r.json(); }).then(function (man) {
      MAN = man;
      return Promise.all(Object.keys(man).map(function (nom) {
        return new Promise(function (ok) {
          var im = new Image();
          im.onload = function () { ok(); };
          im.onerror = function () { ok(); };
          im.src = ASSETS + nom + '.webp?v=' + VERSIO;
          IMG[nom] = im;
        });
      }));
    }).then(function () { carregat = true; preparaCaus(); });
  }
  function meta(nom) { return MAN[nom] || { w: 0, h: 0, ax: 0, ay: 0 }; }

  // ------------------------------------------------------------------ mida i vista
  // En pantalles estretes es retalla una mica pels costats perquè tot es vegi més gran.
  var vista = { x0: 0, x1: W, k: 1, dpr: 1, cw: 0, ch: 0 };
  var cau = { cel: null, paisatge: null, ratxes: null, vinyeta: null };
  function redimensiona() {
    var amplada = escenari.clientWidth || 600;
    var estret = amplada < 620;
    vista.x0 = estret ? 150 : 0; vista.x1 = estret ? 1290 : W;
    escenari.classList.toggle('fm-estret', estret);
    var vw = vista.x1 - vista.x0;
    escenari.style.aspectRatio = vw + ' / ' + H;
    vista.dpr = Math.min(2, window.devicePixelRatio || 1);
    vista.cw = Math.round(amplada * vista.dpr);
    vista.ch = Math.round(amplada * H / vw * vista.dpr);
    tela.width = vista.cw; tela.height = vista.ch;
    vista.k = vista.cw / vw;
    if (carregat) preparaCaus();
  }
  function offscreen(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function preparaCaus() {
    var k = vista.k;
    // paisatge ja retallat i escalat a la mida exacta del llenç
    cau.paisatge = offscreen(vista.cw, vista.ch);
    var c = cau.paisatge.getContext('2d');
    c.drawImage(IMG.paisatge, vista.x0, 0, vista.x1 - vista.x0, H, 0, 0, vista.cw, vista.ch);
    // tires del cel i de les ratxes, escalades una sola vegada
    // tres versions del cel que s'alternen: el dibuix "bull" com en una animació feta a mà
    cau.cel = [0, 1, 2].map(function (i) {
      var mc = meta('cel' + i), c = offscreen(mc.w * k, mc.h * k);
      c.getContext('2d').drawImage(IMG['cel' + i], 0, 0, c.width, c.height);
      return c;
    });
    var mr = meta('ratxes'); cau.ratxes = offscreen(mr.w * k, mr.h * k);
    cau.ratxes.getContext('2d').drawImage(IMG.ratxes, 0, 0, cau.ratxes.width, cau.ratxes.height);
    // vinyetatge suau del paper (com a la prova d'art)
    cau.vinyeta = offscreen(vista.cw, vista.ch);
    var v = cau.vinyeta.getContext('2d');
    var g = v.createRadialGradient(vista.cw / 2, vista.ch / 2, vista.ch * 0.25, vista.cw / 2, vista.ch / 2, vista.ch * 0.85);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(232,228,220,1)');
    v.fillStyle = g; v.fillRect(0, 0, vista.cw, vista.ch);
  }

  // ------------------------------------------------------------------ so: gravacions reals (CC0) amb Web Audio
  // Fitxers MP3 a la carpeta de sons (per defecte, al costat de la d'assets). Si encara no s'han carregat, no sona res.
  var SONS = root.getAttribute('data-sons') || ASSETS.replace(/assets\/?$/, 'sons/');
  var FITXERS = ['cop0', 'cop1', 'cop2', 'enfonsa', 'esquerda0', 'esquerda1', 'tram', 'construit', 'turbines', 'vent', 'tic', 'comenca', 'bonus', 'fi'];
  var ac = null, mestre = null, silenci = llegeix(CLAU_SO) === '0', crus = {}, buf = {}, fons = {};
  function baixaSons() {
    FITXERS.forEach(function (n) {
      fetch(SONS + n + '.mp3?v=' + VERSIO).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (b) { if (b) { crus[n] = b; descodifica(n); } }).catch(function () {});
    });
  }
  function descodifica(n) {
    if (!ac || !crus[n] || buf[n]) return;
    var dades = crus[n]; crus[n] = null;
    var fet = function (b) { buf[n] = b; if (fons[n] && fons[n].pendent) iniciaFons(n); };
    try { var p = ac.decodeAudioData(dades, fet, function () {}); if (p && p.catch) p.catch(function () {}); } catch (e) { /* res */ }
  }
  function activaSo() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
      if (ac) { mestre = ac.createGain(); mestre.gain.value = silenci ? 0 : 1; var comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; mestre.connect(comp); comp.connect(ac.destination); FITXERS.forEach(descodifica); }
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function sona(n, vol, rate, retard) {
    if (!ac || !buf[n]) return;
    var s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf[n]; s.playbackRate.value = rate || 1; g.gain.value = vol === undefined ? 1 : vol;
    s.connect(g); g.connect(mestre); s.start(ac.currentTime + (retard || 0));
  }
  function un(llista) { return llista[Math.floor(Math.random() * llista.length)]; }
  // sons de fons en bucle (vent i molins construïts): el volum canvia suaument
  function iniciaFons(n) {
    var f = fons[n]; if (!ac || !f) return;
    if (!buf[n]) { f.pendent = true; return; }
    f.pendent = false;
    if (f.src) return;
    var s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf[n]; s.loop = true; s.loopStart = 0.06; s.loopEnd = buf[n].duration - 0.06;   // sense el silenci dels extrems de l'MP3
    g.gain.value = 0; s.connect(g); g.connect(mestre); s.start(0, 0.06);
    f.src = s; f.g = g; posaFons(n, f.vol, 1.2);
  }
  function posaFons(n, vol, temps) {
    var f = fons[n] || (fons[n] = { vol: 0 });
    f.vol = vol;
    if (!ac) return;
    if (!f.src) { if (vol > 0) iniciaFons(n); return; }
    var ara = ac.currentTime;
    f.g.gain.cancelScheduledValues(ara); f.g.gain.setValueAtTime(f.g.gain.value, ara);
    f.g.gain.linearRampToValueAtTime(vol, ara + (temps || 0.8));
  }
  var SO = {
    esquerda: function () { sona(un(['esquerda0', 'esquerda1']), 0.55, 0.9 + Math.random() * 0.2); },
    tram: function (n) { sona('tram', 0.5, 0.85 + n * 0.12); },
    cop: function (r, pts) {
      sona(un(['cop0', 'cop1', 'cop2']), 1, 1 + Math.min(r, 10) * 0.025 + (Math.random() - 0.5) * 0.06);
      sona('enfonsa', 0.45, 0.95 + Math.random() * 0.1, 0.09);
      if (pts === 3) sona('bonus', 0.35, 1.0, 0.04);
    },
    perd: function () {
      sona('construit', 1, 0.95 + Math.random() * 0.1);
      // com més molins construïts, més s'imposa el brunzit de les turbines
      posaFons('turbines', Math.min(0.85, 0.4 + 0.1 * (joc.construits - 1)), 1.2);
    },
    tic: function () { sona('tic', 0.7); },
    comenca: function () { sona('comenca', 0.5); },
    fi: function () { sona('fi', 0.7); posaFons('vent', 0, 2.5); posaFons('turbines', 0, 2.5); },
    inici: function () { posaFons('turbines', 0, 0.3); posaFons('vent', 0.3, 2.0); }
  };
  function vibra(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* res */ } }

  // ------------------------------------------------------------------ elements de l'escena
  var NUVOLS = [ // parallax: lluny petits i lents, a prop grans i ràpids. Sempre per darrere del paisatge.
    { img: 'nuvol2', x: 180, y: 70, s: 0.55, v: 112 }, { img: 'nuvol0', x: 1000, y: 58, s: 0.5, v: 124 },
    { img: 'nuvol1', x: 620, y: 150, s: 0.72, v: 178 }, { img: 'nuvol3', x: 1450, y: 176, s: 0.66, v: 192 },
    { img: 'nuvol0', x: 80, y: 252, s: 0.95, v: 262 }, { img: 'nuvol1', x: 900, y: 278, s: 1.0, v: 284 }
  ];
  var PLANTES = [];
  function creaPlantes() {
    PLANTES = [];
    var noms = Object.keys(MAN).filter(function (n) { return n.indexOf('planta') === 0; });
    for (var i = 0; i < 130; i++) {
      var x = rnd(-20, W + 20), vora = x < 330 || x > 1110;
      if (!vora && Math.random() < 0.45) continue;           // al mig n'hi ha menys perquè no tapin els molins
      var nom = noms[Math.floor(Math.random() * noms.length)];
      PLANTES.push({ img: nom, x: x, y: H + rnd(4, 14), s: (vora ? rnd(1.05, 1.5) : rnd(0.65, 0.95)),
        fase: rnd(0, 6.28), rig: rnd(0.7, 1.3), flip: Math.random() < 0.5 });
    }
    PLANTES.sort(function (a, b) { return a.s - b.s; });
  }
  // Multitud petita que es va aplegant al peu del poble a mesura que s'aturen molins (discreta, de fons)
  var GENT = [];
  var ROBA = ['#5b8a62', '#c79a45', '#6f8fa0', '#8a5a4a', '#4f5a62', '#9b7fa0'];
  function creaGent() {
    GENT = [];
    for (var i = 0; i < 38; i++) {
      GENT.push({ x: rnd(1040, 1272), y: HOR + rnd(40, 58), h: rnd(9, 13), roba: ROBA[Math.floor(Math.random() * ROBA.length)],
        fase: rnd(0, 6.28), bracos: Math.random() < 0.35, a: 0 });
    }
    // les primeres que arriben, al mig; les darreres, als extrems
    GENT.sort(function (a, b) { return Math.abs(a.x - 1150) - Math.abs(b.x - 1150); });
  }

  // Animals de la plana: un ramat d'ovelles i cigonyes que van picant pels camps.
  // Si un molí brolla on n'hi ha un, l'ovella desapareix en una polseguera i la cigonya arrenca el vol; al cap d'una estona en tornen.
  var BESTIES = [], ZONA_Y0 = 708, ZONA_Y1 = 985, ESC_BESTIA = 0.74;
  function llocLliure(x, y) { return molins.every(function (l) { return Math.abs(l.x - x) > 95 * l.s + 30 || Math.abs(l.y - y) > 55; }); }
  function puntPlana(prop, radi) {
    var x = 0, y = 0;
    for (var k = 0; k < 25; k++) {
      x = prop ? prop.x + rnd(-radi, radi) : rnd(vista.x0 + 60, vista.x1 - 60);
      y = prop ? prop.y + rnd(-radi, radi) * 0.45 : rnd(ZONA_Y0, ZONA_Y1);
      x = clamp(x, vista.x0 + 45, vista.x1 - 45); y = clamp(y, ZONA_Y0, ZONA_Y1);
      if (llocLliure(x, y)) break;
    }
    return { x: x, y: y };
  }
  function novaBestia(tipus, x, y) {
    return { tipus: tipus, x: x, y: y, tx: x, ty: y, estat: 'quiet', t: rnd(0, 3), espera: rnd(0.3, 3), flip: Math.random() < 0.5 ? -1 : 1,
             a: 1, alt: 0, vx: 0, fase: rnd(0, 6.28), d0: 1, alt0: 0 };
  }
  function creaBesties() {
    BESTIES = [];
    var c = puntPlana(null);
    for (var i = 0; i < 5; i++) { var p = puntPlana(c, 80); BESTIES.push(novaBestia('ovella', p.x, p.y)); }
    for (var j = 0; j < 2; j++) { var q = puntPlana(null); BESTIES.push(novaBestia('cigonya', q.x, q.y)); }
  }
  function centreRamat() {
    var n = 0, x = 0, y = 0;
    BESTIES.forEach(function (b) { if (b.tipus === 'ovella' && (b.estat === 'quiet' || b.estat === 'camina')) { n++; x += b.x; y += b.y; } });
    return n ? { x: x / n, y: y / n } : null;
  }
  function espanta(x, y, s) {
    BESTIES.forEach(function (b) {
      if (b.estat !== 'quiet' && b.estat !== 'camina') return;
      if (Math.abs(b.x - x) > 70 * s + 28 || Math.abs(b.y - y) > 50) return;
      b.t = 0;
      if (b.tipus === 'cigonya') { b.estat = 'vola'; b.flip = b.x < x ? -1 : 1; b.vx = b.flip * 210 * escala(b.y); }
      else { b.estat = 'fuig'; pols({ x: b.x, y: b.y, s: escala(b.y) * 0.75 }, false); }
    });
  }
  function torna(b) {
    var esq = Math.random() < 0.5, p;
    b.a = 1; b.t = 0;
    if (b.tipus === 'ovella') {
      p = puntPlana(centreRamat(), 90);
      b.x = esq ? vista.x0 - 50 : vista.x1 + 50; b.y = p.y; b.tx = p.x; b.ty = p.y; b.estat = 'camina';
    } else {                                     // la cigonya torna volant i es posa en un camp
      p = puntPlana(null);
      b.x = esq ? vista.x0 - 90 : vista.x1 + 90; b.y = p.y; b.tx = p.x; b.ty = p.y; b.estat = 'arriba';
      b.d0 = Math.max(1, Math.abs(p.x - b.x)); b.alt0 = 260 * escala(p.y); b.alt = b.alt0;
    }
    b.flip = b.tx > b.x ? 1 : -1;
  }
  function mouBesties(dt) {
    var ramat = centreRamat();
    BESTIES.forEach(function (b) {
      b.t += dt;
      var s = escala(b.y);
      if (b.estat === 'quiet') {
        b.espera -= dt;
        if (b.espera <= 0) {
          var p = b.tipus === 'ovella' ? puntPlana(ramat || b, 95) : puntPlana(b, 240);
          b.tx = p.x; b.ty = p.y; b.estat = 'camina';
        }
      } else if (b.estat === 'camina') {
        var dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), v = (b.tipus === 'ovella' ? 26 : 34) * s;
        if (d < 3) { b.estat = 'quiet'; b.espera = b.tipus === 'ovella' ? rnd(2.5, 6) : rnd(1.5, 4.5); }
        else { b.x += dx / d * v * dt; b.y += dy / d * v * dt; if (Math.abs(dx) > 1.5) b.flip = dx > 0 ? 1 : -1; }
      } else if (b.estat === 'fuig') {           // l'ovella fa un bot d'espant i s'esvaeix
        b.a = 1 - b.t / 0.4; b.alt = Math.sin(clamp(b.t / 0.4, 0, 1) * Math.PI) * 22 * s;
        if (b.t >= 0.4) { b.estat = 'fora'; b.espera = rnd(6, 11); b.a = 0; b.alt = 0; }
      } else if (b.estat === 'vola') {           // la cigonya se'n va volant
        b.x += b.vx * dt; b.alt += 150 * s * dt * Math.min(1, b.t * 2);
        if (b.x < vista.x0 - 120 || b.x > vista.x1 + 120 || b.alt > 700) { b.estat = 'fora'; b.espera = rnd(7, 12); b.alt = 0; }
      } else if (b.estat === 'arriba') {
        var ddx = b.tx - b.x, dist = Math.abs(ddx), va = 170 * s;
        if (!llocLliure(b.tx, b.ty)) { var q = puntPlana(null); b.tx = q.x; b.ty = q.y; b.flip = b.tx > b.x ? 1 : -1; b.d0 = Math.max(1, Math.abs(b.tx - b.x)); }
        if (dist < 4) { b.estat = 'quiet'; b.alt = 0; b.espera = rnd(1, 3); }
        else { b.x += Math.sign(ddx) * Math.min(dist, va * dt); b.alt = b.alt0 * Math.pow(Math.min(1, dist / b.d0), 1.4); }
      } else if (b.estat === 'fora') {
        b.espera -= dt; if (b.espera <= 0) torna(b);
      }
    });
  }
  function frameBestia(b, t) {
    var pas = Math.floor((t + b.fase) / 0.16) % 2, bull = Math.floor((t + b.fase) / 0.32) % 2;
    if (b.tipus === 'ovella') return (b.estat === 'quiet' ? 'ovella_m' + bull : 'ovella_c' + pas);
    if (b.estat === 'vola' || b.estat === 'arriba') return 'cigonya_v' + (Math.floor((t + b.fase) / 0.2) % 2);
    if (b.estat === 'camina') return 'cigonya_c' + pas;
    return Math.sin(b.t * 1.1 + b.fase) > -0.2 ? 'cigonya_p' + bull : 'cigonya_c' + bull;
  }
  function dibuixaBestia(b, t) {
    if (b.estat === 'fora' || b.a <= 0) return;
    var nom = frameBestia(b, t), im = IMG[nom], m = meta(nom);
    if (!im || !m.w) return;
    var sc = escala(b.y) * ESC_BESTIA;
    ctx.save(); ctx.globalAlpha = clamp(b.a, 0, 1);
    ctx.translate(b.x, b.y - b.alt); ctx.scale(sc * b.flip, sc);
    ctx.drawImage(im, -m.ax, -m.ay, m.w, m.h); ctx.restore();
  }

  // ------------------------------------------------------------------ estat del joc
  var joc = { fase: 'repos', t: 0, temps: 0, punts: 0, aturats: 0, ratxa: 0, millorRatxa: 0, propera: 0, compte: 0, ultimTic: -1,
              congela: 0, sacseig: 0, construits: 0, ajust: 1 };
  var molins = [], petjades = [];
  var efectes = { pols: [], terrossos: [], segells: [], textos: [] };
  var rec = parseInt(llegeix(CLAU_REC), 10) || 0;

  // Dificultat: creix amb el temps i s'adapta a qui juga.
  // joc.ajust > 1 vol dir que la persona va justa (els molins creixen més a poc a poc); < 1, que ho para tot (van més de pressa).
  function dificultat() {
    var p = clamp(joc.temps / DURADA, 0, 1), a = joc.ajust;
    return { cada: lerp(1.35, 0.6, p) * Math.max(1, a), creix: lerp(3.0, 1.6, p) * a, avis: lerp(0.55, 0.38, p) * Math.max(1, a),
             max: 2 + Math.floor(p * 2.6) };
  }
  var AJUST_MIN = 0.72, AJUST_MAX = 1.6;
  function actius() { return molins.filter(function (l) { return l.estat === 'avis' || l.estat === 'creix'; }).length; }

  function brota() {
    var d = dificultat();
    for (var k = 0; k < 40; k++) {
      var y = lerp(Y_FONS, Y_DAVANT, Math.pow(Math.random(), 0.85)), s = escala(y);
      var marge = 115 * s + 24;                                   // dins la part visible (també en mòbil)
      var x = rnd(vista.x0 + marge, vista.x1 - marge);
      var lliure = molins.every(function (o) {
        var dx = Math.abs(x - o.x), dy = Math.abs(y - o.y);
        return dy < 140 ? dx > 112 * (s + o.s) : dx > 58 * (s + o.s);   // a la mateixa fondària, ben separats
      });
      if (!lliure) continue;
      molins.push({ x: x, y: y, s: s, estat: 'avis', t: 0, dur: d.avis, creixDur: d.creix * rnd(0.9, 1.1),
        esq: Math.floor(Math.random() * 6), rot: rnd(0, Math.PI * 2), flip: Math.random() < 0.5 ? -1 : 1,
        ang: rnd(0, 6.28), tram: 0, esqFade: 0, creixFet: 0, alcadaVista: 0 });
      espanta(x, y, s);
      SO.esquerda();
      return;
    }
  }

  // fases del creixement dins de 'creix' (fracció del temps total)
  var TRAMS = [[0.0, 0.22, 0, 0.36], [0.27, 0.47, 0.36, 0.70], [0.52, 0.70, 0.70, 1.0]];
  function formaMoli(l) {
    // retorna l'alçada de torre (g), gòndola (n) i pales (b) segons l'estat
    if (l.estat === 'avis') return { g: 0, n: 0, b: 0 };
    if (l.estat === 'perdut') return { g: 1, n: 1, b: 1 };
    if (l.estat === 'fet') return { g: 0, n: 0, b: 0 };
    var f = l.estat === 'creix' ? clamp(l.t / l.dur, 0, 1) : l.creixFet;
    var g = 0, n = 0, b = 0;
    for (var i = 0; i < TRAMS.length; i++) {
      var tr = TRAMS[i];
      if (f >= tr[0]) g = lerp(tr[2], tr[3], easeBack(clamp((f - tr[0]) / (tr[1] - tr[0]), 0, 1)));
    }
    if (f >= 0.72) n = easeBack(clamp((f - 0.72) / 0.08, 0, 1));
    if (f >= 0.8) b = easeOut(clamp((f - 0.8) / 0.2, 0, 1));
    return { g: g, n: n, b: b };
  }

  function pols(l, gran) {
    var seq = Math.random() < 0.5 ? 0 : 1;
    efectes.pols.push({ x: l.x + rnd(-10, 10) * l.s, y: l.y + 4 * l.s, s: l.s * (gran ? 0.95 : 0.7), seq: seq, t: 0 });
  }
  function terrossos(l, n) {
    for (var i = 0; i < n; i++) {
      efectes.terrossos.push({ x: l.x, y: l.y, vx: rnd(-260, 300) * l.s, vy: rnd(-520, -300) * l.s, s: l.s * rnd(0.7, 1.3),
        img: 'terros' + Math.floor(Math.random() * 4), terra: l.y + rnd(-6, 10) * l.s, t: 0, rot: rnd(0, 6) });
    }
  }

  // Quant s'ha enfonsat un molí (en unitats del món): primer s'aixafa i després la mà l'empeny sota terra
  function baixada(l) {
    if (l.estat !== 'enfonsa') return { dy: 0, aixafa: 0 };
    var q = clamp(l.t / l.dur, 0, 1), f = formaMoli(l);
    var aixafa = q < 0.2 ? Math.sin(q / 0.2 * Math.PI) * 0.22 : 0;
    var e = q < 0.2 ? 0 : Math.pow((q - 0.2) / 0.8, 1.6);
    return { dy: e * (HFULL * Math.min(l.alcadaVista, 1) + 40 + BL * f.b), aixafa: aixafa };
  }
  function encerta(l) {
    if (joc.fase !== 'joc' || (l.estat !== 'avis' && l.estat !== 'creix')) return false;
    var f = formaMoli(l);
    l.creixFet = l.estat === 'creix' ? clamp(l.t / l.dur, 0, 1) : 0;
    l.alcadaVista = f.g;
    l.estat = 'enfonsa'; l.t = 0; l.dur = DUR_ENFONSA;
    // com més aviat s'atura, més punts: a l'esquerda 3, al primer tram 2, després 1
    var pts = l.creixFet === 0 ? 3 : l.creixFet < TRAMS[0][1] ? 2 : 1;
    joc.punts += pts; joc.aturats++; joc.ratxa++; joc.millorRatxa = Math.max(joc.millorRatxa, joc.ratxa);
    joc.ajust = clamp(joc.ajust - (pts >= 2 ? 0.035 : 0.015), AJUST_MIN, AJUST_MAX);
    efectes.textos.push({ txt: '+' + pts, x: l.x + 70 * l.s, y: l.y - HFULL * l.s * 0.55, t: 0, v: 0.8, mida: 44 + 18 * pts * Math.max(0.6, l.s), color: pts === 3 ? '#1f6a2c' : '#da1415' });
    var hm = 0.3 + 0.35 * Math.max(f.g, 0.25);
    var ma = 'ma' + Math.floor(Math.random() * 3);
    // la mà queda "enganxada" al molí i baixa amb ell fins a terra
    efectes.segells.push({ m: l, x: l.x, y0: l.y - HFULL * l.s * hm, s: l.s, t: 0, img: ma, rot: rnd(-0.3, 0.3) });
    petjades.push({ x: l.x + rnd(-20, 20) * l.s, y: l.y + 10 * l.s, s: l.s, img: ma, rot: rnd(0, 6.28) });
    if (petjades.length > 20) petjades.shift();
    pols(l, true); terrossos(l, 7);
    if (!reduit) { joc.congela = 0.05; joc.sacseig = Math.min(12, 5 + joc.ratxa * 0.5); }
    if (joc.ratxa >= 3) efectes.textos.push({ txt: 'RATXA ×' + joc.ratxa + '!', x: (vista.x0 + vista.x1) / 2, y: 330, t: 0, v: 0.9, mida: 64, color: '#1f6a2c' });
    SO.cop(joc.ratxa, pts); vibra(18);
    ui.punts.textContent = joc.punts;
    return true;
  }

  function perd(l) {
    l.estat = 'perdut'; l.t = 0;
    joc.ratxa = 0; joc.construits++;
    joc.ajust = clamp(joc.ajust + 0.16, AJUST_MIN, AJUST_MAX);   // va just: li donem una mica més de temps
    efectes.textos.push({ txt: 'Camp perdut', x: l.x, y: l.y - 70 * l.s, t: 0, v: 1.2, mida: 30 + 22 * l.s, color: '#ae1011' });
    pols(l, true);
    if (!reduit) joc.sacseig = 4;
    SO.perd();
    if (joc.construits >= MAX_CONSTRUITS) acaba();
  }

  // ------------------------------------------------------------------ actualització
  function actualitza(dt) {
    joc.t += dt;
    if (joc.congela > 0) { joc.congela -= dt; return; }   // aturada breu en encertar: dóna pes al cop
    mouBesties(dt);
    molins.forEach(function (l) {
      if (l.estat === 'avis') {
        l.t += dt;
        if (l.t >= l.dur) { l.estat = 'creix'; l.t = 0; l.dur = l.creixDur; l.tram = 0; }
      } else if (l.estat === 'creix') {
        l.t += dt;
        var f = l.t / l.dur;
        for (var i = 0; i < TRAMS.length; i++) {
          var aterra = TRAMS[i][0] + (TRAMS[i][1] - TRAMS[i][0]) * 0.35;
          if (l.tram === i && f >= aterra) { l.tram = i + 1; pols(l, false); terrossos(l, 3); SO.tram(i); if (!reduit) joc.sacseig = Math.max(joc.sacseig, 2.5); }
        }
        if (f >= 0.86) l.ang += dt * 1.6 * (f - 0.86) / 0.14;
        if (l.t >= l.dur) perd(l);
      } else if (l.estat === 'enfonsa') {
        l.t += dt;
        if (l.t >= l.dur) { l.estat = 'fet'; l.esqFade = 0.7; }
      } else if (l.estat === 'fet') {
        l.esqFade -= dt;
      }
      if (l.estat === 'perdut') l.ang += dt * 2.3;
    });
    molins = molins.filter(function (l) { return !(l.estat === 'fet' && l.esqFade <= 0); });
    if (joc.fase === 'joc') {
      joc.temps += dt;
      var d = dificultat();
      joc.propera -= dt;
      if (actius() === 0 && joc.propera > 0.25) joc.propera = 0.25;   // qui ho para tot rep el següent molí de seguida
      if (joc.propera <= 0) { if (actius() < d.max) brota(); joc.propera = d.cada * rnd(0.8, 1.2); }
      var resta = DURADA - joc.temps;
      if (resta <= 5 && Math.ceil(resta) !== joc.ultimTic) { joc.ultimTic = Math.ceil(resta); SO.tic(); }
      ui.temps.textContent = Math.max(0, Math.ceil(resta));
      ui.barra.style.width = clamp(resta / DURADA, 0, 1) * 100 + '%';
      ui.barra.parentNode.classList.toggle('fm-urgent', resta <= 5);
      if (joc.temps >= DURADA) acaba();
    }
    if (joc.fase === 'compte') {
      joc.compte -= dt;
      if (joc.compte <= 0) {
        joc.fase = 'joc'; escenari.classList.add('fm-jugant'); SO.comenca();
        efectes.textos.push({ txt: 'JA!', x: W / 2, y: H * 0.42, t: 0, v: 0.7, mida: 170, color: '#1f6a2c' });
      }
    }
    // efectes
    efectes.pols = efectes.pols.filter(function (p) { p.t += dt; p.x += 30 * p.s * dt * 3; return p.t < 0.46; });
    efectes.terrossos = efectes.terrossos.filter(function (p) {
      p.t += dt; p.x += p.vx * dt; p.vy += 1500 * dt; p.y += p.vy * dt; p.rot += dt * 6;
      return !(p.vy > 0 && p.y > p.terra) && p.t < 1.5;
    });
    efectes.segells = efectes.segells.filter(function (p) { p.t += dt; return p.t < 1.15; });
    efectes.textos = efectes.textos.filter(function (p) { p.t += dt; return p.t < p.v; });
    if (joc.sacseig > 0) joc.sacseig = Math.max(0, joc.sacseig - dt * 45);
  }

  // ------------------------------------------------------------------ dibuix
  function img(nom, x, y, esc, mode, alfa) {
    var im = IMG[nom], m = meta(nom);
    if (!im || !im.complete) return;
    if (mode) ctx.globalCompositeOperation = mode;
    if (alfa !== undefined) ctx.globalAlpha = alfa;
    ctx.drawImage(im, x - (m.ax || 0) * esc, y - (m.ay || 0) * esc, m.w * esc, m.h * esc);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function sobreTerra(x, y, esc, rot, sx, nom, mode, alfa) {
    // dibuix "tombat" al terra: s'aixafa en vertical i es pot girar en el pla del terra
    var im = IMG[nom], m = meta(nom); if (!im) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(esc, esc * 0.3); ctx.rotate(rot); ctx.scale(sx, 1);
    if (mode) ctx.globalCompositeOperation = mode;
    if (alfa !== undefined) ctx.globalAlpha = alfa;
    ctx.drawImage(im, -m.ax, -m.ay, m.w, m.h);
    ctx.restore();
  }

  function dibuixaCel(t) {
    var k = vista.k, cel = cau.cel[((Math.floor(t / 0.16) % 3) + 3) % 3];
    var vel = 90;                       // el cel (la capa més llunyana) llisca amb la tramuntana
    var x = -vista.x0 * k - ((t * vel) % (2 * W)) * k;   // la tira es repeteix cada 2W: sense salts
    ctx.drawImage(cel, x, 0); ctx.drawImage(cel, x + cel.width, 0);
  }
  function dibuixaRatxes(t) {
    // ratxes de tramuntana: la capa més ràpida, per davant dels núvols i per darrere de les muntanyes
    var k = vista.k, r = cau.ratxes, vr = 900, xr = -vista.x0 * k - ((t * vr) % (2 * W)) * k;
    ctx.save(); ctx.translate(0, 40 * k);
    ctx.drawImage(r, xr, 0); ctx.drawImage(r, xr + r.width, 0);
    ctx.restore();
  }
  function enLogica(fn) {
    ctx.save();
    var sx = 0, sy = 0;
    if (joc.sacseig > 0) { sx = (Math.random() * 2 - 1) * joc.sacseig; sy = (Math.random() * 2 - 1) * joc.sacseig; }
    ctx.setTransform(vista.k, 0, 0, vista.k, (sx - vista.x0) * vista.k, sy * vista.k);
    fn();
    ctx.restore();
  }

  function dibuixaMoli(l, t) {
    var f = formaMoli(l), s = l.s, bx = baixada(l), aixafa = bx.aixafa;
    if (l.estat === 'enfonsa') f = { g: l.alcadaVista, n: f.n, b: f.b };
    if (f.g <= 0.01) return;
    var v = Math.floor(t / 0.16) % 2;      // la línia "bull"
    ctx.save();
    ctx.translate(l.x, l.y); ctx.scale(s, s);
    ctx.beginPath(); ctx.rect(-500, -1400, 1000, 1404); ctx.clip();        // tot el que baixa queda sota terra
    var estira = Math.max(1, f.g), puja = Math.max(0, 1 - f.g) * HFULL + bx.dy;
    ctx.translate(0, puja); ctx.scale(1 + aixafa + (estira - 1) * -1.5, (estira) * (1 - aixafa * 0.6));
    var mt = meta('torre' + v);
    ctx.drawImage(IMG['torre' + v], -mt.ax, -mt.ay, mt.w, mt.h);
    var hubY = -HFULL - 14;
    if (f.n > 0.01) {
      var mg = meta('gondola' + v);
      ctx.save(); ctx.translate(0, hubY); ctx.scale(f.n, f.n); ctx.drawImage(IMG['gondola' + v], -mg.ax, -mg.ay, mg.w, mg.h); ctx.restore();
    }
    if (f.b > 0.01) {
      var mr = meta('rotor' + v);
      ctx.save(); ctx.translate(0, hubY); ctx.rotate(l.ang); ctx.scale(f.b, f.b); ctx.drawImage(IMG['rotor' + v], -mr.ax, -mr.ay, mr.w, mr.h); ctx.restore();
    }
    ctx.restore();
  }

  function dibuixa(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, tela.width, tela.height);
    if (!carregat) return;
    dibuixaCel(t);
    enLogica(function () {
      // núvols (parallax) i ocells, per darrere del paisatge
      NUVOLS.forEach(function (n) {
        var m = meta(n.img), vel = n.v;
        var x = ((n.x + vel * t) % (W + 700)) - 350;
        ctx.drawImage(IMG[n.img], x - m.w * n.s / 2, n.y - m.h * n.s / 2, m.w * n.s, m.h * n.s);
      });
      var cicle = 26, tb = t % cicle;
      if (tb < 22) {
        var bx = -120 + tb * 80, by = 330 - tb * 5;
        [[0, 0], [-40, 15], [-74, -6], [-110, 22]].forEach(function (o, i) {
          img('ocell' + (Math.floor(t * 8 + i) % 3), bx + o[0], by + o[1] + Math.sin(t * 2 + i) * 3, 1, 'multiply');
        });
      }
    });
    dibuixaRatxes(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cau.paisatge, 0, 0);
    enLogica(function () {
      // gent que s'aplega al poble (molt petita, al fons)
      var quanta = joc.fase === 'repos' ? 0 : Math.min(GENT.length, Math.floor(joc.punts * 1.3));
      GENT.forEach(function (g, i) {
        g.a += ((i < quanta ? 1 : 0) - g.a) * 0.05;
        if (g.a < 0.02) return;
        var bob = Math.abs(Math.sin(t * 3 + g.fase)) * 1.2, h = g.h, y = g.y - bob;
        ctx.globalAlpha = g.a * 0.85; ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = g.roba;
        ctx.fillRect(g.x - h * 0.2, y - h * 0.72, h * 0.4, h * 0.42);                  // cos
        ctx.fillStyle = '#2b3238';
        ctx.fillRect(g.x - h * 0.17, y - h * 0.32, h * 0.13, h * 0.32);                 // cames
        ctx.fillRect(g.x + h * 0.04, y - h * 0.32, h * 0.13, h * 0.32);
        ctx.beginPath(); ctx.arc(g.x, y - h * 0.85, h * 0.14, 0, Math.PI * 2); ctx.fill();  // cap
        if (g.bracos) { ctx.fillStyle = g.roba; ctx.fillRect(g.x - h * 0.3, y - h * 1.0, h * 0.1, h * 0.38); ctx.fillRect(g.x + h * 0.2, y - h * 1.0, h * 0.1, h * 0.38); }
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // terra: formigó dels camps perduts, petjades de mà i esquerdes
      molins.forEach(function (l) { if (l.estat === 'perdut') sobreTerra(l.x, l.y + 4 * l.s, l.s * 0.62, l.rot, 1, 'formigo' + (l.esq % 2)); });
      petjades.forEach(function (p) { sobreTerra(p.x, p.y, p.s * 0.34, p.rot, 1, p.img, 'multiply', 0.22); });
      molins.forEach(function (l) {
        if (l.estat === 'perdut') return;
        var e = l.estat === 'avis' ? 0.35 + 0.65 * easeOut(clamp(l.t / l.dur, 0, 1)) : 1;
        var a = l.estat === 'fet' ? clamp(l.esqFade / 0.7, 0, 1) : 1;
        sobreTerra(l.x, l.y + 4 * l.s, l.s * 0.62 * e, l.rot, l.flip, 'esquerda' + l.esq, null, a);
      });
      // molins i pols, ordenats de darrere cap endavant
      var capes = molins.map(function (l) { return { y: l.y, m: l }; })
        .concat(BESTIES.map(function (b) { return { y: b.y - 1, b: b }; }))
        .concat(efectes.pols.map(function (p) { return { y: p.y - 3, p: p }; }))
        .sort(function (a, b) { return a.y - b.y; });
      capes.forEach(function (c) {
        if (c.m) { dibuixaMoli(c.m, t); return; }
        if (c.b) { dibuixaBestia(c.b, t); return; }
        var p = c.p, k = Math.min(3, Math.floor(p.t / 0.1));
        img('pols' + p.seq + '_' + k, p.x + k * 24 * p.s, p.y, p.s);
      });
      efectes.terrossos.forEach(function (p) {
        var m = meta(p.img); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.s, p.s);
        ctx.drawImage(IMG[p.img], -m.ax, -m.ay, m.w, m.h); ctx.restore();
      });
      // mans estampades: baixen amb el molí que empenyen i es queden a terra (s'imprimeixen a sobre: multiply)
      efectes.segells.forEach(function (p) {
        var m = meta(p.img), e = p.t < 0.08 ? 1.4 - (p.t / 0.08) * 0.4 : 1, a = p.t < 0.75 ? 1 : 1 - (p.t - 0.75) / 0.4;
        var bx = p.m && p.m.estat === 'enfonsa' ? baixada(p.m).dy * p.s : (p.ultima || 0);
        p.ultima = bx;
        var y = Math.min(p.y0 + bx, p.m ? p.m.y - 60 * p.s : p.y0);
        ctx.save(); ctx.translate(p.x, y); ctx.rotate(p.rot); ctx.scale(p.s * 0.55 * e, p.s * 0.55 * e);
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = clamp(a, 0, 1);
        ctx.drawImage(IMG[p.img], -m.ax, -m.ay, m.w, m.h); ctx.restore();
      });
      // herbes, espigues, fonoll i roselles que es mouen amb el vent (onada d'esquerra a dreta)
      PLANTES.forEach(function (p) {
        var m = meta(p.img), amp = 0.11;
        var a = (Math.sin(t * 3.9 - p.x / 160) * amp + Math.sin(t * 2.3 + p.fase) * 0.025) / p.rig;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a); ctx.scale(p.s * (p.flip ? -1 : 1), p.s);
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(IMG[p.img], -m.ax, -m.ay, m.w, m.h); ctx.restore();
      });
      ctx.globalCompositeOperation = 'source-over';
      // textos (ratxa, camp perdut, compte enrere)
      efectes.textos.forEach(function (p) {
        var a = 1 - p.t / p.v, dy = -p.t * 50;
        ctx.save(); ctx.globalAlpha = clamp(a * 1.4, 0, 1);
        ctx.font = p.mida + 'px Anton, Impact, "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = p.mida * 0.14; ctx.strokeStyle = '#f3eee1'; ctx.lineJoin = 'round';
        ctx.strokeText(p.txt, p.x, p.y + dy); ctx.fillStyle = p.color; ctx.fillText(p.txt, p.x, p.y + dy); ctx.restore();
      });
      if (joc.fase === 'compte' && joc.compte > 0) {
        var n = Math.ceil(joc.compte), fr = joc.compte - Math.floor(joc.compte);
        ctx.save(); ctx.font = (200 + fr * 80) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 22; ctx.strokeStyle = '#f3eee1'; ctx.lineJoin = 'round'; ctx.strokeText(String(n), W / 2, H * 0.42);
        ctx.fillStyle = '#da1415'; ctx.fillText(String(n), W / 2, H * 0.42); ctx.restore();
      }
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(cau.vinyeta, 0, 0); ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ bucle (només quan la secció es veu)
  var visible = true, enMarxa = false, ant = 0, tempsEscena = 0;
  function bucle(ara) {
    if (!enMarxa) return;
    var dt = clamp((ara - ant) / 1000 || 0, 0, 0.1); ant = ara;   // el temps mai no va enrere
    tempsEscena += dt;
    actualitza(dt);
    dibuixa(tempsEscena);
    requestAnimationFrame(bucle);
  }
  function engega() { if (enMarxa || !carregat) return; enMarxa = true; if (ac && ac.state === 'suspended') ac.resume(); ant = performance.now(); requestAnimationFrame(bucle); }
  function atura() { enMarxa = false; if (ac && ac.state === 'running') ac.suspend(); }
  function revisaMarxa() { if (visible && !document.hidden) engega(); else atura(); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; revisaMarxa(); }, { threshold: 0.05 }).observe(escenari);
  }
  document.addEventListener('visibilitychange', revisaMarxa);

  // ------------------------------------------------------------------ entrada
  function aLogica(ev) {
    var r = tela.getBoundingClientRect();
    return { x: vista.x0 + (ev.clientX - r.left) / r.width * (vista.x1 - vista.x0), y: (ev.clientY - r.top) / r.height * H, escala: r.width / (vista.x1 - vista.x0) };
  }
  tela.addEventListener('pointerdown', function (ev) {
    if (joc.fase !== 'joc') return;
    ev.preventDefault();
    var p = aLogica(ev), millor = null, dMin = 1e9;
    molins.forEach(function (l) {
      if (l.estat !== 'avis' && l.estat !== 'creix') return;
      var f = formaMoli(l);
      var mitja = Math.max(105 * l.s, 26 / p.escala);              // com a mínim 52 px de pantalla d'amplada
      var dalt = l.y - Math.max(170, (HFULL * f.g + (f.b > 0 ? BL * f.b : 60))) * l.s - 20;
      var baix = l.y + Math.max(60 * l.s, 24 / p.escala);
      if (p.x > l.x - mitja && p.x < l.x + mitja && p.y > dalt && p.y < baix) {
        var d = Math.abs(p.x - l.x) / l.s;
        if (d < dMin) { dMin = d; millor = l; }
      }
    });
    if (millor) encerta(millor);
  });
  function urgencia(l) { return l.estat === 'creix' ? 1 + l.t / l.dur : 0.5 * l.t / l.dur; }
  root.addEventListener('keydown', function (ev) {
    if (joc.fase !== 'joc' || (ev.key !== ' ' && ev.key !== 'Enter')) return;
    ev.preventDefault();
    var urgent = molins.filter(function (l) { return l.estat === 'avis' || l.estat === 'creix'; })
      .sort(function (a, b) { return urgencia(b) - urgencia(a); })[0];
    if (urgent) encerta(urgent);
  });

  // ------------------------------------------------------------------ partides
  function comenca() {
    activaSo();
    molins = []; petjades = []; creaGent();
    efectes.pols = []; efectes.terrossos = []; efectes.segells = []; efectes.textos = [];
    joc.fase = 'compte'; joc.compte = 3; joc.temps = 0; joc.punts = 0; joc.ratxa = 0; joc.millorRatxa = 0;
    joc.propera = 0.3; joc.ultimTic = -1; joc.construits = 0; joc.aturats = 0; joc.ajust = 1;
    ui.punts.textContent = '0'; ui.temps.textContent = DURADA; ui.barra.style.width = '100%';
    ui.inici.hidden = true; ui.final.hidden = true; ui.hud.hidden = false; escenari.classList.remove('fm-en-final');
    SO.inici(); SO.tic(); setTimeout(SO.tic, 1000); setTimeout(SO.tic, 2000);
    tela.focus({ preventScroll: true });
    engega();
  }
  function acaba() {
    if (joc.fase !== 'joc') return;
    joc.fase = 'fi'; escenari.classList.remove('fm-jugant');
    molins.forEach(function (l) { if (l.estat === 'avis' || l.estat === 'creix') { var f = formaMoli(l); l.creixFet = l.estat === 'creix' ? l.t / l.dur : 0; l.alcadaVista = f.g; l.estat = 'enfonsa'; l.t = 0; l.dur = DUR_ENFONSA; } });
    var c = joc.construits;
    var nou = joc.punts > rec; if (nou) { rec = joc.punts; desa(CLAU_REC, String(rec)); }
    ui.fPunts.textContent = joc.punts;
    ui.fAturats.textContent = joc.aturats;
    ui.fConstruits.textContent = c;
    ui.fRec.textContent = nou && joc.punts > 0 ? 'Nou rècord!' : (rec ? 'El teu rècord: ' + rec + ' punts' : '');
    ui.fFrase.textContent = c === 0 ? 'No se n\u2019ha construït ni un. La plana segueix sent de tothom.'
      : c <= 3 ? 'Has defensat la plana, però alguns molins s\u2019han quedat.' : 'Els molins s\u2019han menjat bona part de la plana.';
    SO.fi();
    setTimeout(function () { ui.hud.hidden = true; ui.final.hidden = false; escenari.classList.add('fm-en-final'); ui.torna.focus({ preventScroll: true }); }, 900);
    anuncia('Fi de la partida. Has fet ' + joc.punts + ' punts: has aturat ' + joc.aturats + ' molins i se n\u2019han construït ' + c + '.');
    mostraRec();
  }
  function mostraRec() { if (ui.recInici) ui.recInici.textContent = rec ? 'El teu rècord: ' + rec + ' punts' : ''; }

  ui.juga.addEventListener('click', function () { if (carregat) comenca(); });
  ui.torna.addEventListener('click', comenca);
  function pintaSo() {
    ui.so.setAttribute('aria-pressed', String(silenci));
    ui.so.setAttribute('aria-label', silenci ? 'Activa el so' : 'Silencia el so');
    ui.so.classList.toggle('fm-mut', silenci);
  }
  ui.so.addEventListener('click', function () {
    silenci = !silenci; desa(CLAU_SO, silenci ? '0' : '1'); activaSo();
    if (mestre) mestre.gain.setTargetAtTime(silenci ? 0 : 1, ac.currentTime, 0.05);
    pintaSo();
  });
  pintaSo();
  // «Comparteix»: Web Share API i, si no n'hi ha (p. ex. navegadors d'escriptori o d'apps), copia el text i l'enllaç.
  // El text es pot fixar a la pàgina amb data-comparteix-text (ha d'incloure l'enllaç); si no, es fa amb els punts.
  if (ui.comparteix) {
    var textFix = root.getAttribute('data-comparteix-text');
    var potCopiar = !!(navigator.clipboard && navigator.clipboard.writeText);
    if (navigator.share || potCopiar) {
      ui.comparteix.hidden = false;
      var etiqueta = ui.comparteix.textContent;
      var avisa = function (t) {
        ui.comparteix.textContent = t; if (ui.anunci) ui.anunci.textContent = t;
        clearTimeout(avisa.t); avisa.t = setTimeout(function () { ui.comparteix.textContent = etiqueta; }, 2500);
      };
      ui.comparteix.addEventListener('click', function () {
        var url = location.href.split('#')[0] + '#joc';
        var text = textFix || ('He fet ' + joc.punts + ' punts aturant molins a la plana de l’Empordanet. Defensem l’Empordanet!');
        var copia = function () {
          if (!potCopiar) return;
          navigator.clipboard.writeText(textFix || (text + ' ' + url)).then(function () { avisa('Enllaç copiat!'); }, function () { avisa('No s’ha pogut copiar'); });
        };
        if (navigator.share) {
          navigator.share(textFix ? { title: 'Fora molins!', text: textFix } : { title: 'Fora molins!', text: text, url: url })
            .catch(function (e) { if (!e || e.name !== 'AbortError') copia(); });
        } else copia();
      });
    }
  }

  // ------------------------------------------------------------------ arrencada
  if (/[?&]debug\b/.test(location.search)) window.__foraMolins = { joc: joc, molins: function () { return molins; }, besties: function () { return BESTIES; }, brota: function () { brota(); }, espanta: espanta, encerta: encerta, formaMoli: formaMoli, dibuixa: function (t) { dibuixa(t); }, atura: function () { atura(); }, llest: function () { return carregat; }, cau: function () { return cau; }, sons: function () { return { carregats: Object.keys(buf).sort(), estat: ac ? ac.state : 'sense' }; } };
  var imgLogo = root.querySelector('[data-logo]'); if (imgLogo) imgLogo.src = ASSETS + 'logo.webp?v=' + VERSIO;   // logotip de la plataforma a la pantalla final
  redimensiona();
  if ('ResizeObserver' in window) new ResizeObserver(function () { redimensiona(); }).observe(escenari);
  else window.addEventListener('resize', redimensiona);
  mostraRec();
  ui.juga.disabled = true; ui.juga.textContent = 'Carregant…';
  // els gràfics només es descarreguen quan el visitant s'acosta a la secció (la portada no es fa més lenta)
  var iniciat = false;
  function inicia() {
    if (iniciat) return; iniciat = true;
    carrega().then(function () {
      creaPlantes(); creaGent(); creaBesties(); baixaSons();
      ui.juga.disabled = false; ui.juga.textContent = 'Juga';
      revisaMarxa();
    }).catch(function () {
      iniciat = false; ui.juga.disabled = false; ui.juga.textContent = 'Torna-ho a provar';
      ui.juga.addEventListener('click', inicia, { once: true });
    });
  }
  if ('IntersectionObserver' in window) {
    var aprop = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { aprop.disconnect(); inicia(); } }, { rootMargin: '600px 0px' });
    aprop.observe(escenari);
  } else { inicia(); }
})();
