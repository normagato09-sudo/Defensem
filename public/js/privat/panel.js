/* Tauler de l'àrea privada (rutes per hash: #/inici, #/nova, #/editar/<id>, #/meves, #/revisio,
   #/totes[/<estat>], #/entitats, #/entitat/<id|nova>[/<id de sol·licitud>], #/sollicituds, #/eines, #/eina/<id|nova>,
   #/documents, #/usuaris).
   El rol es llegeix SEMPRE de la taula profiles. El menú només s'hi adapta per comoditat:
   qui decideix què es pot fer són les polítiques RLS i els triggers de la base de dades. */
(function () {
  'use strict';
  var P = window.Privat, S = window.Segur, el = P.el;
  var vista = document.getElementById('vista'), menuUl = document.getElementById('menu');
  var nav = document.getElementById('menu-privat'), mbp = document.getElementById('mbp');
  var avisos = document.getElementById('avisos');
  var ESCRIU = ['admin', 'editor', 'col_laborador'], EDITA = ['admin', 'editor'], TOTS = ['admin', 'editor', 'col_laborador', 'consulta'];
  var TIPUS = { noticia: 'Notícia', comunicat: 'Comunicat' };
  // Mateixa llista que el check de supabase/schema.sql i que js/entitats.js.
  var TIPUS_ENT = { associacio: 'Associació', collectiu: 'Col·lectiu', entitat_veinal: 'Entitat veïnal', fundacio: 'Fundació',
    cooperativa: 'Cooperativa', sindicat: 'Sindicat o organització professional', observatori: 'Observatori',
    xarxa: 'Xarxa d’entitats', altres: 'Altres' };
  // Mateixa llista que el check de supabase/schema.sql i que js/eines.js.
  var CAT_EINA = { urbanisme: 'Urbanisme', energia: 'Energia', paisatge: 'Paisatge', medi_natural: 'Medi natural', altres: 'Altres' };
  var ESTATS_SOL = { nova: 'Nova', revisada: 'Revisada', acceptada: 'Acceptada', descartada: 'Rebutjada' };
  var MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  var SENSE_PERMIS = 'No tens permís per fer aquesta acció.';
  var jo = null, torn = 0, sb = P.client();

  var RUTES = [
    { r: 'inici', t: 'Inici', rols: TOTS, f: vInici },
    { r: 'nova', t: 'Nova publicació', rols: ESCRIU, f: vFormulari },
    { r: 'meves', t: 'Les meves publicacions', rols: ESCRIU, f: vMeves },
    { r: 'revisio', t: 'Revisió', rols: EDITA, f: vRevisio },
    { r: 'totes', t: 'Totes les publicacions', rols: EDITA, f: vTotes },
    { r: 'entitats', t: 'Entitats', rols: EDITA, f: vEntitats },
    { r: 'entitat', t: 'Entitat', rols: EDITA, f: vEntitat, pare: 'entitats' },
    { r: 'sollicituds', t: 'Sol·licituds d’adhesió', rols: EDITA, f: vSollicituds },
    { r: 'eines', t: 'Eines', rols: EDITA, f: vEines },
    { r: 'eina', t: 'Eina', rols: EDITA, f: vEina, pare: 'eines' },
    { r: 'documents', t: 'Documents', rols: TOTS, f: vDocuments },
    { r: 'usuaris', t: 'Usuaris', rols: ['admin'], f: vUsuaris }
  ];
  function pot(rols) { return !!jo && rols.indexOf(jo.rol) !== -1; }

  // ---------- utilitats ----------
  function avis(text, tipus, alerta) {
    clearTimeout(avis.t);
    avisos.textContent = '';
    if (!text) return;
    avisos.appendChild(el('p', { class: 'msg' + (tipus === 'error' ? ' error' : ''), role: alerta ? 'alert' : null }, [text]));
    avis.t = setTimeout(function () { avisos.textContent = ''; }, tipus === 'error' ? 12000 : 6000);
  }
  function falla(e) { avis(P.errorText(e), 'error'); }
  // Pinta la vista només si l'usuari no ha canviat de secció mentrestant.
  function pinta(t, nodes) {
    if (t !== torn) return false;
    vista.textContent = '';
    nodes.forEach(function (n) { if (n) vista.appendChild(n); });
    return true;
  }
  function refresca() { encamina(); }
  function estat(e) { return el('span', { class: 'estat ' + e }, [P.ESTATS[e] || e]); }
  function data(iso) { return S.dataCurta(iso); }
  function buit(text) { return el('p', { class: 'buit-privat' }, [text]); }
  function boto(text, classe, clic, extra) {
    var at = { type: 'button', class: 'btn petit ' + (classe || ''), onclick: clic };
    Object.keys(extra || {}).forEach(function (k) { at[k] = extra[k]; });
    return el('button', at, [text]);
  }
  function enllacRuta(text, ruta, classe) { return el('a', { href: '#/' + ruta, class: classe || '' }, [text]); }
  // Executa una operació d'escriptura i comprova que ha afectat alguna fila (si no, RLS l'ha bloquejada).
  async function escriu(consulta, columna) {
    var r = await consulta.select(columna || 'id');
    if (r.error) { falla(r.error); return null; }
    if (!r.data || (Array.isArray(r.data) && !r.data.length)) { avis(SENSE_PERMIS, 'error'); return null; }
    return r.data;
  }
  async function mapaNoms() {
    var r = await sb.from('noms_usuaris').select('id,nom');
    var m = {};
    (r.data || []).forEach(function (u) { m[u.id] = u.nom || '(sense nom)'; });
    return m;
  }
  function esborraImatge(cami) {
    if (!cami || !jo || /^https:\/\//i.test(cami)) return;  // un logo extern (https://) no és a Storage
    if (cami.indexOf(jo.id + '/') !== 0 && jo.rol !== 'admin') return;
    sb.storage.from('portades').remove([cami]).catch(function () {});
  }
  function imatgePortada(cami, src) {
    var u = src || (/^https:\/\//i.test(cami || '') ? S.enllac(cami) : S.urlImatge(null, cami));
    if (!u) return null;
    var i = el('img', { class: 'portada-prev', alt: 'Imatge de portada', src: u });
    i.addEventListener('error', function () { i.remove(); });
    return i;
  }

  // ---------- llistes de publicacions ----------
  function itemPub(p, noms) {
    var potEditar = pot(EDITA) || (p.autor_id === jo.id && (p.estat === 'esborrany' || p.estat === 'retornat'));
    return el('li', { class: 'item' }, [
      el('h3', null, [p.titol]),
      el('div', { class: 'meta' }, [
        estat(p.estat),
        el('span', null, [TIPUS[p.tipus] || p.tipus]),
        noms ? el('span', null, ['Autor: ' + (noms[p.autor_id] || '—')]) : null,
        el('span', null, ['Actualitzada el ' + data(p.updated_at)])
      ]),
      p.estat === 'retornat' && p.nota_revisio ? el('div', { class: 'nota' }, [el('strong', null, ['Nota de revisió']), p.nota_revisio]) : null,
      el('div', { class: 'accions' }, [enllacRuta(potEditar ? 'Edita' : 'Mostra', 'editar/' + p.id, 'btn o petit')])
    ]);
  }
  async function mevesPublicacions() {
    var r = await sb.from('publicacions').select('id,tipus,titol,estat,nota_revisio,autor_id,updated_at')
      .eq('autor_id', jo.id).order('updated_at', { ascending: false });
    if (r.error) throw r.error;
    return r.data || [];
  }

  // ---------- Inici ----------
  async function vInici(t) {
    var nodes = [
      el('h1', null, ['Hola, ' + (jo.nom || jo.email)]),
      el('p', null, ['Has entrat com a ', el('strong', null, [P.ROLS[jo.rol]]), '.'])
    ];
    if (pot(ESCRIU)) {
      var pubs = await mevesPublicacions();
      nodes.push(el('p', { class: 'destacat' }, [enllacRuta('Crea una nova notícia', 'nova', 'btn')]));
      var compte = {};
      pubs.forEach(function (p) { compte[p.estat] = (compte[p.estat] || 0) + 1; });
      nodes.push(el('h2', null, ['Les teves publicacions']));
      nodes.push(el('ul', { class: 'comptadors' }, Object.keys(P.ESTATS).map(function (e) {
        return el('li', null, [el('strong', null, [String(compte[e] || 0)]), el('span', null, [P.ESTATS[e]])]);
      })));
      var retornades = pubs.filter(function (p) { return p.estat === 'retornat'; });
      if (retornades.length) {
        nodes.push(el('h2', null, ['Retornades per a correccions']));
        nodes.push(el('ul', { class: 'llista' }, retornades.map(function (p) { return itemPub(p); })));
      }
      nodes.push(el('h2', null, ['Darrers canvis']));
      var altres = pubs.filter(function (p) { return p.estat !== 'retornat'; });
      nodes.push(altres.length ? el('ul', { class: 'llista' }, altres.slice(0, 5).map(function (p) { return itemPub(p); }))
        : buit(pubs.length ? 'No hi ha altres publicacions.' : 'Encara no has escrit cap publicació.'));
    }
    if (pot(EDITA)) {
      var pend = await sb.from('publicacions').select('id', { count: 'exact', head: true }).eq('estat', 'pendent');
      if (!pend.error) nodes.push(el('p', null, ['Publicacions pendents de revisió: ', el('strong', null, [String(pend.count || 0)]), ' · ', enllacRuta('Ves a Revisió', 'revisio')]));
    }
    nodes.push(el('h2', null, ['El teu compte']));
    nodes.push(el('p', null, [enllacRuta('Consulta els documents interns', 'documents'), ' · ',
      el('a', { href: '/area-privada/contrasenya.html' }, ['Canvia la contrasenya'])]));
    pinta(t, nodes);
  }

  async function vMeves(t) {
    var pubs = await mevesPublicacions();
    pinta(t, [
      el('h1', null, ['Les meves publicacions']),
      el('p', null, [enllacRuta('Crea una nova notícia', 'nova', 'btn')]),
      pubs.length ? el('ul', { class: 'llista' }, pubs.map(function (p) { return itemPub(p); })) : buit('Encara no has escrit cap publicació.')
    ]);
  }

  // ---------- Formulari de publicació ----------
  async function vFormulari(t, id) {
    var p = null;
    if (id) {
      if (!S.esUuid(id)) { pinta(t, [el('h1', null, ['No hem trobat aquesta publicació.'])]); return; }
      var r = await sb.from('publicacions').select('*').eq('id', id).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) { pinta(t, [el('h1', null, ['No hem trobat aquesta publicació.']), el('p', null, ['Potser no existeix o no hi tens accés.'])]); return; }
      p = r.data;
    }
    var editora = pot(EDITA);
    var editable = !p || editora || (p.autor_id === jo.id && (p.estat === 'esborrany' || p.estat === 'retornat'));
    var imatgeActual = p ? p.imatge : null, fitxerNou = null, treure = false;

    var fTipus = el('select', { id: 'f-tipus', disabled: !editable, value: p ? p.tipus : 'noticia' },
      Object.keys(TIPUS).map(function (k) { return el('option', { value: k }, [TIPUS[k]]); }));
    var fTitol = el('input', { id: 'f-titol', type: 'text', maxlength: 200, required: true, disabled: !editable, value: p ? p.titol : '' });
    var fResum = el('textarea', { id: 'f-resum', maxlength: 500, disabled: !editable, 'aria-describedby': 'f-resum-ajuda', value: p ? p.resum : '' });
    var cont = el('div', { class: 'portada-actual' });
    function portadaTriada() {
      if (fitxerNou) return imatgePortada(null, URL.createObjectURL(fitxerNou));
      return treure ? null : imatgePortada(imatgeActual);
    }
    function pintaPortada() {
      cont.textContent = '';
      var img = portadaTriada();
      if (img) {
        cont.appendChild(img);
        if (editable) cont.appendChild(boto('Treu la imatge', 'o fosc', function () {
          fitxerNou = null; treure = true; fImatge.value = ''; nomFitxer.textContent = 'Sense imatge.'; pintaPortada();
        }));
      }
    }
    var fImatge = el('input', { id: 'f-imatge', type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: !editable, 'aria-describedby': 'f-imatge-nom f-imatge-ajuda' });
    var nomFitxer = el('span', { class: 'nom-fitxer', id: 'f-imatge-nom' }, [imatgeActual ? 'Té imatge de portada.' : 'Sense imatge.']);
    fImatge.addEventListener('change', function () {
      var f = fImatge.files && fImatge.files[0];
      if (!f) return;
      if (!MIME[f.type]) { avis('La imatge ha de ser JPEG, PNG o WebP.', 'error'); fImatge.value = ''; return; }
      if (f.size > 5 * 1024 * 1024) { avis('La imatge no pot superar els 5 MB.', 'error'); fImatge.value = ''; return; }
      fitxerNou = f; treure = false; nomFitxer.textContent = 'Imatge nova: ' + f.name; pintaPortada();
    });

    // Editor de format senzill
    var editor = el('div', { id: 'f-contingut', class: 'editor', contenteditable: editable ? 'true' : 'false', role: 'textbox',
      'aria-multiline': 'true', 'aria-labelledby': 'f-contingut-etiqueta', 'data-placeholder': 'Escriu aquí el text de la publicació…' });
    if (p && p.contingut) editor.appendChild(S.neteja(p.contingut));
    editor.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    editor.addEventListener('drop', function (e) { e.preventDefault(); });
    function ordre(c, v) { editor.focus(); document.execCommand(c, false, v == null ? null : v); }
    function bloc(etiqueta) {
      var actual = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      ordre('formatBlock', actual === etiqueta ? '<p>' : '<' + etiqueta + '>');
    }
    function enllac() {
      var sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) { avis('Selecciona primer el text que vols convertir en enllaç.', 'error'); return; }
      var rang = sel.getRangeAt(0);
      var u = window.prompt('Adreça de l’enllaç (ha de començar per https:// o mailto:)', 'https://');
      if (u === null) return;
      u = u.trim();
      var net = /^(https:\/\/|mailto:)/i.test(u) ? S.enllac(u) : '';
      if (!net) { avis('L’enllaç ha de començar per https:// o mailto:.', 'error'); return; }
      editor.focus(); sel.removeAllRanges(); sel.addRange(rang);
      document.execCommand('createLink', false, net);
    }
    var barra = el('div', { class: 'barra-editor', role: 'toolbar', 'aria-label': 'Format del text', 'aria-controls': 'f-contingut' }, [
      ['Negreta', function () { ordre('bold'); }], ['Cursiva', function () { ordre('italic'); }],
      ['Títol', function () { bloc('h2'); }], ['Llista', function () { ordre('insertUnorderedList'); }],
      ['Llista numerada', function () { ordre('insertOrderedList'); }], ['Cita', function () { bloc('blockquote'); }],
      ['Enllaç', enllac], ['Neteja format', function () { ordre('removeFormat'); ordre('unlink'); ordre('formatBlock', '<p>'); }]
    ].map(function (b) {
      var x = el('button', { type: 'button', onclick: b[1] }, [b[0]]);
      x.addEventListener('mousedown', function (e) { e.preventDefault(); }); // conserva la selecció
      return x;
    }));

    var previ = el('section', { class: 'previsualitzacio', hidden: true, 'aria-label': 'Previsualització' });
    var bPrevi = boto('Previsualitza', 'o fosc', function () {
      if (!previ.hidden) { previ.hidden = true; bPrevi.textContent = 'Previsualitza'; return; }
      previ.textContent = '';
      previ.appendChild(el('p', { class: 'kicker' }, [TIPUS[fTipus.value] + ' · previsualització']));
      previ.appendChild(el('h2', null, [fTitol.value || '(sense títol)']));
      if (fResum.value) previ.appendChild(el('p', null, [el('strong', null, [fResum.value])]));
      var img = portadaTriada();
      if (img) previ.appendChild(img);
      var c = el('div', { class: 'contingut' }); c.appendChild(S.neteja(editor.innerHTML)); previ.appendChild(c);
      previ.hidden = false; bPrevi.textContent = 'Amaga la previsualització';
      previ.scrollIntoView({ block: 'nearest' });
    });

    var botons = [];
    async function desa(nouEstat) {
      var titol = fTitol.value.trim();
      if (!titol) { avis('El títol és obligatori.', 'error'); fTitol.focus(); return; }
      var contingut = S.serialitza(editor.innerHTML);
      if (contingut.length > 50000) { avis('El text és massa llarg (màxim 50.000 caràcters).', 'error'); return; }
      botons.forEach(function (b) { b.disabled = true; });
      var pujada = null;
      try {
        var imatge = treure ? null : imatgeActual;
        if (fitxerNou) {
          pujada = jo.id + '/' + crypto.randomUUID() + '.' + MIME[fitxerNou.type];
          var up = await sb.storage.from('portades').upload(pujada, fitxerNou, { contentType: fitxerNou.type, upsert: false });
          if (up.error) { pujada = null; avis('No s’ha pogut pujar la imatge. ' + (/security|policy|403/i.test(up.error.message || '') ? SENSE_PERMIS : ''), 'error'); return; }
          imatge = pujada;
        }
        var dades = { tipus: fTipus.value, titol: titol, resum: fResum.value.trim(), contingut: contingut, imatge: imatge,
          estat: nouEstat || (p ? p.estat : 'esborrany') };
        if (nouEstat === 'publicat') dades.nota_revisio = null;
        var res;
        if (!p) { dades.autor_id = jo.id; res = await escriu(sb.from('publicacions').insert(dades)); }
        else { if (!editora) delete dades.nota_revisio; res = await escriu(sb.from('publicacions').update(dades).eq('id', p.id)); }
        if (!res) { if (pujada) esborraImatge(pujada); return; }
        if (imatgeActual && imatgeActual !== imatge) esborraImatge(imatgeActual);
        avis({ esborrany: 'Desat.', retornat: 'Desat.', pendent: 'Enviada a revisió.', publicat: 'Publicada. Ja es veu a la web.', arxivat: 'Arxivada.' }[dades.estat] || 'Desat.');
        var nouId = Array.isArray(res) ? res[0].id : res.id;
        if (!p) location.hash = '#/editar/' + nouId; else refresca();
      } catch (e) {
        if (pujada) esborraImatge(pujada);
        falla(e);
      } finally {
        botons.forEach(function (b) { b.disabled = false; });
      }
    }
    if (editable) {
      botons.push(boto('Desa', 'o fosc', function () { desa(null); }));
      if (!p || p.estat !== 'pendent') botons.push(boto('Envia a revisió', '', function () { desa('pendent'); }));
      if (editora) {
        if (!p || p.estat !== 'publicat') botons.push(boto('Publica', 'v', function () { desa('publicat'); }));
        if (p && p.estat !== 'arxivat') botons.push(boto('Arxiva', 'o', function () { desa('arxivat'); }));
      }
    }

    var nodes = [
      el('p', { class: 'kicker' }, [p ? 'Publicació' : 'Nova publicació']),
      el('h1', null, [p ? p.titol : 'Nova publicació']),
      p ? el('p', null, ['Estat: ', estat(p.estat)]) : null,
      p && p.estat === 'retornat' && p.nota_revisio ? el('div', { class: 'msg error' }, [el('strong', null, ['Nota de revisió: ']), p.nota_revisio]) : null,
      !editable ? el('p', { class: 'msg' }, ['Aquesta publicació està en estat «' + P.ESTATS[p.estat] + '» i ara no la pots modificar. Només la pots consultar.']) : null,
      el('form', { novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
        el('div', { class: 'graella-form' }, [
          el('div', { class: 'camp' }, [el('label', { for: 'f-tipus' }, ['Tipus']), fTipus]),
          el('div', { class: 'camp' }, [el('label', { for: 'f-titol' }, ['Títol']), fTitol, el('span', { class: 'ajuda' }, ['Màxim 200 caràcters.'])])
        ]),
        el('div', { class: 'camp' }, [el('label', { for: 'f-resum' }, ['Resum']), fResum,
          el('span', { class: 'ajuda', id: 'f-resum-ajuda' }, ['Una o dues frases que es veuran a la portada. Màxim 500 caràcters.'])]),
        el('div', { class: 'camp' }, [el('span', { class: 'etiqueta-camp' }, ['Imatge de portada']), cont,
          el('div', { class: 'fitxer' }, [fImatge, el('label', { for: 'f-imatge', class: 'btn o fosc petit' }, [imatgeActual ? 'Canvia la imatge' : 'Tria una imatge']), nomFitxer]),
          el('span', { class: 'ajuda', id: 'f-imatge-ajuda' }, ['JPEG, PNG o WebP. Màxim 5 MB. Opcional.'])]),
        el('div', { class: 'camp' }, [el('span', { class: 'etiqueta-camp', id: 'f-contingut-etiqueta' }, ['Text']), editable ? barra : null, editor,
          el('span', { class: 'ajuda' }, ['El text enganxat s’hi afegeix sense format. Els enllaços han de començar per https:// o mailto:.'])]),
        el('div', { class: 'accions' }, [bPrevi].concat(botons))
      ]),
      previ
    ];
    if (pinta(t, nodes)) {
      pintaPortada();
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* no tots els navegadors */ }
    }
  }

  // ---------- Revisió ----------
  async function canviaEstat(id, nouEstat, nota) {
    var dades = { estat: nouEstat };
    if (nota !== undefined) dades.nota_revisio = nota;
    if (nouEstat === 'publicat') dades.nota_revisio = null;
    var r = await escriu(sb.from('publicacions').update(dades).eq('id', id));
    if (r) { avis({ publicat: 'Publicada. Ja es veu a la web.', retornat: 'Retornada a l’autor amb la nota.', arxivat: 'Arxivada.' }[nouEstat]); refresca(); }
  }
  async function vRevisio(t) {
    var r = await sb.from('publicacions').select('id,tipus,titol,resum,contingut,imatge,autor_id,updated_at,estat')
      .eq('estat', 'pendent').order('updated_at', { ascending: true });
    if (r.error) throw r.error;
    var noms = await mapaNoms();
    var items = (r.data || []).map(function (p) {
      var previ = el('div', { class: 'previsualitzacio', hidden: true });
      var bPrevi = boto('Previsualitza', 'o fosc', function () {
        if (previ.hidden) {
          previ.textContent = '';
          if (p.resum) previ.appendChild(el('p', null, [el('strong', null, [p.resum])]));
          var img = imatgePortada(p.imatge); if (img) previ.appendChild(img);
          var c = el('div', { class: 'contingut' }); c.appendChild(S.neteja(p.contingut)); previ.appendChild(c);
        }
        previ.hidden = !previ.hidden;
        bPrevi.textContent = previ.hidden ? 'Previsualitza' : 'Amaga';
        bPrevi.setAttribute('aria-expanded', String(!previ.hidden));
      }, { 'aria-expanded': 'false' });
      var idNota = 'nota-' + p.id;
      var nota = el('textarea', { id: idNota, maxlength: 1000, required: true });
      var retorn = el('div', { class: 'retorn', hidden: true }, [
        el('div', { class: 'camp' }, [el('label', { for: idNota }, ['Nota per a l’autor (obligatòria)']), nota]),
        boto('Confirma el retorn', '', function () {
          var n = nota.value.trim();
          if (!n) { avis('Escriu una nota explicant què cal corregir.', 'error'); nota.focus(); return; }
          canviaEstat(p.id, 'retornat', n);
        })
      ]);
      return el('li', { class: 'item' }, [
        el('h3', null, [p.titol]),
        el('div', { class: 'meta' }, [el('span', null, [TIPUS[p.tipus]]), el('span', null, ['Autor: ' + (noms[p.autor_id] || '—')]),
          el('span', null, ['Enviada el ' + data(p.updated_at)])]),
        el('div', { class: 'accions' }, [
          bPrevi, enllacRuta('Edita', 'editar/' + p.id, 'btn o fosc petit'),
          boto('Publica', 'v', function () { canviaEstat(p.id, 'publicat'); }),
          boto('Retorna', 'o', function () { retorn.hidden = !retorn.hidden; if (!retorn.hidden) nota.focus(); }),
          boto('Arxiva', 'o fosc', function () { canviaEstat(p.id, 'arxivat'); })
        ]),
        retorn, previ
      ]);
    });
    pinta(t, [el('h1', null, ['Revisió']), el('p', null, ['Publicacions enviades a revisió, de la més antiga a la més nova.']),
      items.length ? el('ul', { class: 'llista' }, items) : buit('No hi ha cap publicació pendent de revisió.')]);
  }

  // ---------- Totes les publicacions ----------
  async function vTotes(t, filtre) {
    if (filtre && !P.ESTATS[filtre]) filtre = '';
    var q = sb.from('publicacions').select('id,tipus,titol,estat,autor_id,updated_at,imatge').order('updated_at', { ascending: false });
    if (filtre) q = q.eq('estat', filtre);
    var r = await q;
    if (r.error) throw r.error;
    var noms = await mapaNoms();
    var sel = el('select', { id: 'filtre-estat', value: filtre || '', onchange: function () { location.hash = '#/totes' + (sel.value ? '/' + sel.value : ''); } },
      [el('option', { value: '' }, ['Tots els estats'])].concat(Object.keys(P.ESTATS).map(function (k) { return el('option', { value: k }, [P.ESTATS[k]]); })));
    var files = (r.data || []).map(function (p) {
      return el('tr', null, [
        el('td', null, [enllacRuta(p.titol, 'editar/' + p.id)]),
        el('td', null, [el('div', { class: 'accions-fila' }, [
          el('a', { href: '#/editar/' + p.id, class: 'btn o fosc petit', 'aria-label': 'Edita «' + p.titol + '»' }, ['Edita']),
          jo.rol === 'admin' ? boto('Elimina', 'o', async function () {
            if (!window.confirm('Segur que vols eliminar «' + p.titol + '»? Aquesta acció no es pot desfer.')) return;
            var d = await escriu(sb.from('publicacions').delete().eq('id', p.id));
            if (d) { esborraImatge(p.imatge); avis('Publicació eliminada.'); refresca(); }
          }, { 'aria-label': 'Elimina «' + p.titol + '»' }) : null
        ])]),
        el('td', null, [TIPUS[p.tipus]]), el('td', null, [estat(p.estat)]),
        el('td', null, [noms[p.autor_id] || '—']), el('td', null, [data(p.updated_at)])
      ]);
    });
    pinta(t, [
      el('h1', null, ['Totes les publicacions']),
      el('div', { class: 'filtre' }, [el('div', { class: 'camp' }, [el('label', { for: 'filtre-estat' }, ['Filtra per estat']), sel])]),
      files.length ? el('div', { class: 'taula-wrap', tabindex: '0', role: 'region', 'aria-label': 'Llista de publicacions' }, [
        el('table', { class: 'taula' }, [
          el('thead', null, [el('tr', null, ['Títol', 'Accions', 'Tipus', 'Estat', 'Autor', 'Actualitzada'].map(function (x) { return el('th', { scope: 'col' }, [x]); }))]),
          el('tbody', null, files)
        ])]) : buit('No hi ha cap publicació amb aquest filtre.')
    ]);
  }

  // ---------- Entitats (admin i editor) ----------
  function estatEnt(pub) { return el('span', { class: 'estat ' + (pub ? 'publicat' : 'pendent') }, [pub ? 'Publicada' : 'No publicada']); }  // també per a les eines
  // «@nom», «nom» o una adreça d'Instagram → https://www.instagram.com/nom/ (o '' si no és vàlid).
  function urlInstagram(v) {
    v = (v || '').trim();
    if (!v) return '';
    var m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i) || v.match(/^@?([A-Za-z0-9._]{1,30})$/);
    return m ? 'https://www.instagram.com/' + m[1] + '/' : null;
  }

  async function vEntitats(t) {
    var r = await sb.from('entitats').select('id,nom,tipus,municipi,publicada,logo,updated_at').order('nom');
    if (r.error) throw r.error;
    var pend = await sb.from('sollicituds_entitats').select('id', { count: 'exact', head: true }).eq('estat', 'nova');
    var items = (r.data || []).map(function (e) {
      return el('li', { class: 'item' }, [
        el('h3', null, [e.nom]),
        el('div', { class: 'meta' }, [estatEnt(e.publicada), el('span', null, [TIPUS_ENT[e.tipus] || e.tipus]),
          e.municipi ? el('span', null, [e.municipi]) : null, el('span', null, ['Actualitzada el ' + data(e.updated_at)])]),
        el('div', { class: 'accions' }, [
          enllacRuta('Edita', 'entitat/' + e.id, 'btn o fosc petit'),
          boto(e.publicada ? 'Despublica' : 'Publica', e.publicada ? 'o' : 'v', async function () {
            var ok = await escriu(sb.from('entitats').update({ publicada: !e.publicada }).eq('id', e.id));
            if (ok) { avis(e.publicada ? 'Entitat retirada de la web.' : 'Entitat publicada. Ja es veu a la web.'); refresca(); }
          }, { 'aria-label': (e.publicada ? 'Despublica ' : 'Publica ') + e.nom }),
          boto('Elimina', 'o', async function () {
            if (!window.confirm('Segur que vols eliminar l’entitat «' + e.nom + '»? Aquesta acció no es pot desfer.')) return;
            var d = await escriu(sb.from('entitats').delete().eq('id', e.id));
            if (d) { esborraImatge(e.logo); avis('Entitat eliminada.'); refresca(); }
          }, { 'aria-label': 'Elimina ' + e.nom })
        ])
      ]);
    });
    pinta(t, [
      el('h1', null, ['Entitats']),
      el('p', null, ['Entitats que es mostren a la pàgina pública ', el('a', { href: '/recursos.html#entitats', target: '_blank', rel: 'noopener' }, ['Entitats']),
        '. Només hi surten les publicades.']),
      !pend.error && pend.count ? el('p', { class: 'msg' }, ['Hi ha ', el('strong', null, [String(pend.count)]),
        pend.count === 1 ? ' sol·licitud d’adhesió nova. ' : ' sol·licituds d’adhesió noves. ', enllacRuta('Revisa-les', 'sollicituds')]) : null,
      el('p', { class: 'destacat' }, [enllacRuta('Afegeix una entitat', 'entitat/nova', 'btn')]),
      items.length ? el('ul', { class: 'llista' }, items) : buit('Encara no hi ha cap entitat.')
    ]);
  }

  async function vEntitat(t, id, deSol) {
    var e = null, sol = null;
    if (id && id !== 'nova') {
      if (!S.esUuid(id)) { pinta(t, [el('h1', null, ['No hem trobat aquesta entitat.'])]); return; }
      var r = await sb.from('entitats').select('*').eq('id', id).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) { pinta(t, [el('h1', null, ['No hem trobat aquesta entitat.']), el('p', null, [enllacRuta('Torna a Entitats', 'entitats')])]); return; }
      e = r.data;
    } else if (deSol && S.esUuid(deSol)) {
      var rs = await sb.from('sollicituds_entitats').select('*').eq('id', deSol).maybeSingle();
      if (rs.error) throw rs.error;
      sol = rs.data;
    }
    var ini = e || (sol ? { nom: sol.nom_entitat, tipus: sol.tipus, municipi: sol.municipi, descripcio: sol.descripcio,
      web: /^https:\/\//i.test(sol.web || '') ? sol.web : '', instagram: urlInstagram(sol.instagram) || '' } : {});
    var logoActual = e ? e.logo : null, fitxerNou = null, treure = false;

    var fNom = el('input', { id: 'e-nom', type: 'text', maxlength: 200, required: true, value: ini.nom || '' });
    var fTipus = el('select', { id: 'e-tipus', value: ini.tipus || 'associacio' },
      Object.keys(TIPUS_ENT).map(function (k) { return el('option', { value: k }, [TIPUS_ENT[k]]); }));
    var fMun = el('input', { id: 'e-mun', type: 'text', maxlength: 100, value: ini.municipi || '' });
    var fDesc = el('textarea', { id: 'e-desc', maxlength: 600, 'aria-describedby': 'e-desc-ajuda', value: ini.descripcio || '' });
    var fWeb = el('input', { id: 'e-web', type: 'url', placeholder: 'https://', maxlength: 300, value: ini.web || '' });
    var fIg = el('input', { id: 'e-ig', type: 'text', placeholder: '@nom o https://www.instagram.com/nom/', maxlength: 100, 'aria-describedby': 'e-ig-ajuda', value: ini.instagram || '' });
    var fPub = el('input', { id: 'e-pub', type: 'checkbox', checked: !!(e && e.publicada) });

    var cont = el('div', { class: 'portada-actual' });
    var fLogo = el('input', { id: 'e-logo', type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-describedby': 'e-logo-nom e-logo-ajuda' });
    var nomFitxer = el('span', { class: 'nom-fitxer', id: 'e-logo-nom' }, [!logoActual ? 'Sense logo.'
      : /^https:\/\//i.test(logoActual) ? 'Logo extern provisional (' + logoActual + '). Puja’n una còpia per substituir-lo.' : 'Té logo.']);
    function pintaLogo() {
      cont.textContent = '';
      var img = fitxerNou ? imatgePortada(null, URL.createObjectURL(fitxerNou)) : (treure ? null : imatgePortada(logoActual));
      if (img) {
        img.alt = 'Logo'; img.classList.add('logo-prev');
        cont.appendChild(img);
        cont.appendChild(boto('Treu el logo', 'o fosc', function () { fitxerNou = null; treure = true; fLogo.value = ''; nomFitxer.textContent = 'Sense logo.'; pintaLogo(); }));
      }
    }
    fLogo.addEventListener('change', function () {
      var f = fLogo.files && fLogo.files[0];
      if (!f) return;
      if (!MIME[f.type]) { avis('El logo ha de ser JPEG, PNG o WebP.', 'error'); fLogo.value = ''; return; }
      if (f.size > 5 * 1024 * 1024) { avis('El logo no pot superar els 5 MB.', 'error'); fLogo.value = ''; return; }
      fitxerNou = f; treure = false; nomFitxer.textContent = 'Logo nou: ' + f.name; pintaLogo();
    });

    var bDesa = el('button', { type: 'submit', class: 'btn' }, [e ? 'Desa els canvis' : 'Crea l’entitat']);
    var form = el('form', { novalidate: true, onsubmit: async function (ev) {
      ev.preventDefault();
      var nom = fNom.value.trim(), web = fWeb.value.trim(), ig = urlInstagram(fIg.value);
      if (!nom) { avis('El nom és obligatori.', 'error'); fNom.focus(); return; }
      if (web && (!/^https:\/\/\S+$/i.test(web) || !S.enllac(web))) { avis('El web ha de començar per https://', 'error'); fWeb.focus(); return; }
      if (ig === null) { avis('L’Instagram ha de ser @nom o una adreça d’instagram.com.', 'error'); fIg.focus(); return; }
      bDesa.disabled = true;
      var pujada = null;
      try {
        var logo = treure ? null : logoActual;
        if (fitxerNou) {
          pujada = jo.id + '/' + crypto.randomUUID() + '.' + MIME[fitxerNou.type];
          var up = await sb.storage.from('portades').upload(pujada, fitxerNou, { contentType: fitxerNou.type, upsert: false });
          if (up.error) { pujada = null; avis('No s’ha pogut pujar el logo. ' + (/security|policy|403/i.test(up.error.message || '') ? SENSE_PERMIS : ''), 'error'); return; }
          logo = pujada;
        }
        var dades = { nom: nom, tipus: fTipus.value, municipi: fMun.value.trim(), descripcio: fDesc.value.trim(),
          web: web || null, instagram: ig || null, logo: logo, publicada: fPub.checked };
        var res = e ? await escriu(sb.from('entitats').update(dades).eq('id', e.id)) : await escriu(sb.from('entitats').insert(dades));
        if (!res) { if (pujada) esborraImatge(pujada); return; }
        if (logoActual && logoActual !== logo) esborraImatge(logoActual);
        if (sol && sol.estat !== 'acceptada') await sb.from('sollicituds_entitats').update({ estat: 'acceptada' }).eq('id', sol.id);
        avis(dades.publicada ? 'Desat. L’entitat ja es veu a la web.' : 'Desat. L’entitat encara no és pública.');
        if (!e) location.hash = '#/entitat/' + res[0].id; else refresca();
      } catch (err) {
        if (pujada) esborraImatge(pujada);
        falla(err);
      } finally { bDesa.disabled = false; }
    } }, [
      el('div', { class: 'graella-form' }, [
        el('div', { class: 'camp' }, [el('label', { for: 'e-nom' }, ['Nom']), fNom]),
        el('div', { class: 'camp' }, [el('label', { for: 'e-tipus' }, ['Tipus']), fTipus]),
        el('div', { class: 'camp' }, [el('label', { for: 'e-mun' }, ['Municipi']), fMun])
      ]),
      el('div', { class: 'camp' }, [el('label', { for: 'e-desc' }, ['Descripció breu']), fDesc,
        el('span', { class: 'ajuda', id: 'e-desc-ajuda' }, ['Es mostra a la targeta pública. Màxim 600 caràcters.'])]),
      el('div', { class: 'graella-form' }, [
        el('div', { class: 'camp' }, [el('label', { for: 'e-web' }, ['Web (opcional)']), fWeb]),
        el('div', { class: 'camp' }, [el('label', { for: 'e-ig' }, ['Instagram (opcional)']), fIg,
          el('span', { class: 'ajuda', id: 'e-ig-ajuda' }, ['@nom o adreça del perfil.'])])
      ]),
      el('div', { class: 'camp' }, [el('span', { class: 'etiqueta-camp' }, ['Logo (opcional)']), cont,
        el('div', { class: 'fitxer' }, [fLogo, el('label', { for: 'e-logo', class: 'btn o fosc petit' }, [logoActual ? 'Canvia el logo' : 'Tria un logo']), nomFitxer]),
        el('span', { class: 'ajuda', id: 'e-logo-ajuda' }, ['JPEG, PNG o WebP. Màxim 5 MB. Fes servir només logos que l’entitat us hagi autoritzat a publicar.'])]),
      el('div', { class: 'camp' }, [el('label', { class: 'check' }, [fPub, ' Publicada (es veu a la web pública)'])]),
      el('div', { class: 'accions' }, [bDesa, enllacRuta('Torna a Entitats', 'entitats', 'btn o fosc petit')])
    ]);
    if (pinta(t, [
      el('p', { class: 'kicker' }, ['Entitat']),
      el('h1', null, [e ? e.nom : 'Nova entitat']),
      e ? el('p', null, ['Estat: ', estatEnt(e.publicada)]) : null,
      sol ? el('p', { class: 'msg' }, ['Dades omplertes a partir de la sol·licitud de ' + sol.persona_contacte + '. Revisa-les abans de publicar: en desar, la sol·licitud es marca com a acceptada.']) : null,
      form
    ])) pintaLogo();
  }

  async function vSollicituds(t) {
    var r = await sb.from('sollicituds_entitats').select('*').order('created_at', { ascending: false });
    if (r.error) throw r.error;
    var items = (r.data || []).map(function (s) {
      var web = /^https?:\/\//i.test(s.web || '') ? S.enllac(s.web) : '';
      var dades = [
        ['Tipus', TIPUS_ENT[s.tipus] || s.tipus], ['Municipi', s.municipi], ['Descripció', s.descripcio],
        ['Web', web ? el('a', { href: web, target: '_blank', rel: 'noopener noreferrer' }, [s.web]) : s.web],
        ['Instagram', s.instagram], ['Contacte', s.persona_contacte],
        ['Correu', el('a', { href: 'mailto:' + s.email }, [s.email])], ['Telèfon', s.telefon], ['Missatge', s.missatge]
      ].filter(function (x) { return x[1]; });
      return el('li', { class: 'item' }, [
        el('h3', null, [s.nom_entitat]),
        el('div', { class: 'meta' }, [el('span', { class: 'estat ' + ({ nova: 'pendent', acceptada: 'publicat', descartada: 'arxivat' }[s.estat] || '') }, [ESTATS_SOL[s.estat] || s.estat]),
          el('span', null, ['Rebuda el ' + data(s.created_at)])]),
        el('dl', { class: 'dades-sol' }, dades.reduce(function (a, x) { return a.concat([el('dt', null, [x[0]]), el('dd', null, [x[1]])]); }, [])),
        el('div', { class: 'accions' }, [
          s.estat !== 'acceptada' ? el('a', { href: '#/entitat/nova/' + s.id, class: 'btn v petit', 'aria-label': 'Accepta la sol·licitud de ' + s.nom_entitat + ' i crea l’entitat' }, ['Accepta i crea l’entitat']) : null,
          s.estat !== 'descartada' ? boto('Rebutja', 'o', async function () {
            if (!window.confirm('Rebutjar la sol·licitud de «' + s.nom_entitat + '»? No es publicarà res.')) return;
            var ok = await escriu(sb.from('sollicituds_entitats').update({ estat: 'descartada' }).eq('id', s.id));
            if (ok) { avis('Sol·licitud rebutjada.'); refresca(); }
          }, { 'aria-label': 'Rebutja la sol·licitud de ' + s.nom_entitat }) : null,
          jo.rol === 'admin' ? boto('Elimina', 'o', async function () {
            if (!window.confirm('Segur que vols eliminar la sol·licitud de «' + s.nom_entitat + '»? S’esborraran també les dades de contacte.')) return;
            var d = await escriu(sb.from('sollicituds_entitats').delete().eq('id', s.id));
            if (d) { avis('Sol·licitud eliminada.'); refresca(); }
          }, { 'aria-label': 'Elimina la sol·licitud de ' + s.nom_entitat }) : null
        ])
      ]);
    });
    pinta(t, [
      el('h1', null, ['Sol·licituds d’adhesió']),
      el('p', null, ['Enviades des del formulari de la pàgina Entitats, de la més nova a la més antiga. «Accepta» obre el formulari de l’entitat amb les dades omplertes: revisa-les i desa (no es publica fins que marquis «Publicada»). Les dades de contacte són privades: no les publiquis ni les comparteixis. Esborra les sol·licituds resoltes quan ja no calguin (com a màxim, un any després).']),
      items.length ? el('ul', { class: 'llista' }, items) : buit('No hi ha cap sol·licitud.')
    ]);
  }

  // ---------- Eines (admin i editor) ----------
  async function totesEines() {
    var r = await sb.from('eines').select('id,nom,organisme,categoria,ordre,publicada,updated_at').order('ordre').order('nom');
    if (r.error) throw r.error;
    return r.data || [];
  }
  // Desa l'ordre de la llista tal com es veu (10, 20, 30…). Només s'actualitzen les que canvien.
  async function desaOrdre(llista) {
    for (var i = 0; i < llista.length; i++) {
      var nou = (i + 1) * 10;
      if (llista[i].ordre === nou) continue;
      if (!await escriu(sb.from('eines').update({ ordre: nou }).eq('id', llista[i].id))) return false;
      llista[i].ordre = nou;
    }
    return true;
  }

  async function vEines(t) {
    var eines = await totesEines();
    function mou(i, d) {
      return async function () {
        var l = eines.slice(), x = l[i]; l[i] = l[i + d]; l[i + d] = x;
        if (await desaOrdre(l)) { avis('Ordre desat.'); refresca(); }
      };
    }
    var items = eines.map(function (e, i) {
      return el('li', { class: 'item' }, [
        el('h3', null, [e.nom]),
        el('div', { class: 'meta' }, [estatEnt(e.publicada), el('span', null, [CAT_EINA[e.categoria] || e.categoria]),
          e.organisme ? el('span', null, [e.organisme]) : null, el('span', null, ['Posició ' + (i + 1)])]),
        el('div', { class: 'accions' }, [
          boto('↑ Puja', 'o fosc', mou(i, -1), { disabled: i === 0, 'aria-label': 'Puja ' + e.nom }),
          boto('↓ Baixa', 'o fosc', mou(i, 1), { disabled: i === eines.length - 1, 'aria-label': 'Baixa ' + e.nom }),
          enllacRuta('Edita', 'eina/' + e.id, 'btn o fosc petit'),
          boto(e.publicada ? 'Despublica' : 'Publica', e.publicada ? 'o' : 'v', async function () {
            var ok = await escriu(sb.from('eines').update({ publicada: !e.publicada }).eq('id', e.id));
            if (ok) { avis(e.publicada ? 'Eina retirada de la web.' : 'Eina publicada. Ja es veu a la web.'); refresca(); }
          }, { 'aria-label': (e.publicada ? 'Despublica ' : 'Publica ') + e.nom }),
          boto('Elimina', 'o', async function () {
            if (!window.confirm('Segur que vols eliminar l’eina «' + e.nom + '»? Aquesta acció no es pot desfer.')) return;
            var d = await escriu(sb.from('eines').delete().eq('id', e.id));
            if (d) { avis('Eina eliminada.'); refresca(); }
          }, { 'aria-label': 'Elimina ' + e.nom })
        ])
      ]);
    });
    pinta(t, [
      el('h1', null, ['Eines']),
      el('p', null, ['Visors i eines que es mostren a la pàgina pública ', el('a', { href: '/recursos.html#eines', target: '_blank', rel: 'noopener' }, ['Eines']),
        ', en aquest ordre. Només hi surten les publicades.']),
      el('p', { class: 'destacat' }, [enllacRuta('Afegeix una eina', 'eina/nova', 'btn')]),
      items.length ? el('ul', { class: 'llista' }, items) : buit('Encara no hi ha cap eina.')
    ]);
  }

  async function vEina(t, id) {
    var e = null;
    if (id && id !== 'nova') {
      if (!S.esUuid(id)) { pinta(t, [el('h1', null, ['No hem trobat aquesta eina.'])]); return; }
      var r = await sb.from('eines').select('*').eq('id', id).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) { pinta(t, [el('h1', null, ['No hem trobat aquesta eina.']), el('p', null, [enllacRuta('Torna a Eines', 'eines')])]); return; }
      e = r.data;
    }
    var ordre = e ? e.ordre : 10;
    if (!e) { var totes = await totesEines(); totes.forEach(function (x) { if (x.ordre >= ordre) ordre = x.ordre + 10; }); }

    var fNom = el('input', { id: 'i-nom', type: 'text', maxlength: 200, required: true, value: e ? e.nom : '' });
    var fOrg = el('input', { id: 'i-org', type: 'text', maxlength: 200, value: e ? e.organisme : '' });
    var fDesc = el('textarea', { id: 'i-desc', maxlength: 600, 'aria-describedby': 'i-desc-ajuda', value: e ? e.descripcio : '' });
    var fUrl = el('input', { id: 'i-url', type: 'url', required: true, maxlength: 500, placeholder: 'https://', 'aria-describedby': 'i-url-ajuda', value: e ? e.url : '' });
    var fCat = el('select', { id: 'i-cat', value: e ? e.categoria : 'urbanisme' },
      Object.keys(CAT_EINA).map(function (k) { return el('option', { value: k }, [CAT_EINA[k]]); }));
    var fOrdre = el('input', { id: 'i-ordre', type: 'number', step: 1, 'aria-describedby': 'i-ordre-ajuda', value: String(ordre) });
    var fPub = el('input', { id: 'i-pub', type: 'checkbox', checked: !!(e && e.publicada) });
    var bDesa = el('button', { type: 'submit', class: 'btn' }, [e ? 'Desa els canvis' : 'Crea l’eina']);
    var form = el('form', { novalidate: true, onsubmit: async function (ev) {
      ev.preventDefault();
      var nom = fNom.value.trim(), url = fUrl.value.trim(), ord = parseInt(fOrdre.value, 10);
      if (!nom) { avis('El nom és obligatori.', 'error'); fNom.focus(); return; }
      if (!/^https:\/\/\S+$/i.test(url) || !S.enllac(url)) { avis('L’URL ha de començar per https://', 'error'); fUrl.focus(); return; }
      if (isNaN(ord)) { avis('L’ordre ha de ser un número.', 'error'); fOrdre.focus(); return; }
      bDesa.disabled = true;
      try {
        var dades = { nom: nom, organisme: fOrg.value.trim(), descripcio: fDesc.value.trim(), url: url, categoria: fCat.value, ordre: ord, publicada: fPub.checked };
        var res = e ? await escriu(sb.from('eines').update(dades).eq('id', e.id)) : await escriu(sb.from('eines').insert(dades));
        if (!res) return;
        avis(dades.publicada ? 'Desat. L’eina ja es veu a la web.' : 'Desat. L’eina encara no és pública.');
        if (!e) location.hash = '#/eina/' + res[0].id; else refresca();
      } catch (err) { falla(err); } finally { bDesa.disabled = false; }
    } }, [
      el('div', { class: 'graella-form' }, [
        el('div', { class: 'camp' }, [el('label', { for: 'i-nom' }, ['Nom']), fNom]),
        el('div', { class: 'camp' }, [el('label', { for: 'i-org' }, ['Organisme']), fOrg])
      ]),
      el('div', { class: 'camp' }, [el('label', { for: 'i-desc' }, ['Descripció']), fDesc,
        el('span', { class: 'ajuda', id: 'i-desc-ajuda' }, ['Què s’hi pot consultar. Es mostra a la targeta pública. Màxim 600 caràcters.'])]),
      el('div', { class: 'camp' }, [el('label', { for: 'i-url' }, ['URL']), fUrl,
        el('span', { class: 'ajuda', id: 'i-url-ajuda' }, ['Ha de començar per https://. Comprova abans que s’obre i que és la pàgina oficial.'])]),
      el('div', { class: 'graella-form' }, [
        el('div', { class: 'camp' }, [el('label', { for: 'i-cat' }, ['Categoria']), fCat]),
        el('div', { class: 'camp' }, [el('label', { for: 'i-ordre' }, ['Ordre']), fOrdre,
          el('span', { class: 'ajuda', id: 'i-ordre-ajuda' }, ['Les més petites surten primer. També es pot canviar amb Puja/Baixa a la llista.'])])
      ]),
      el('div', { class: 'camp' }, [el('label', { class: 'check' }, [fPub, ' Publicada (es veu a la web pública)'])]),
      el('div', { class: 'accions' }, [bDesa, enllacRuta('Torna a Eines', 'eines', 'btn o fosc petit')])
    ]);
    pinta(t, [
      el('p', { class: 'kicker' }, ['Eina']),
      el('h1', null, [e ? e.nom : 'Nova eina']),
      e ? el('p', null, ['Estat: ', estatEnt(e.publicada)]) : null,
      form
    ]);
  }

  // ---------- Usuaris (només admin) ----------
  async function vUsuaris(t) {
    var r = await sb.from('profiles').select('id,email,nom,rol,actiu,created_at').order('created_at', { ascending: true });
    if (r.error) throw r.error;
    var files = (r.data || []).map(function (u) {
      var soc = u.id === jo.id;
      var sel = el('select', { 'aria-label': 'Rol de ' + (u.nom || u.email), disabled: soc, value: u.rol },
        Object.keys(P.ROLS).map(function (k) { return el('option', { value: k }, [P.ROLS[k]]); }));
      sel.addEventListener('change', async function () {
        var ok = await escriu(sb.from('profiles').update({ rol: sel.value }).eq('id', u.id));
        if (ok) { u.rol = sel.value; avis('Rol actualitzat: ' + (u.nom || u.email) + ' ara és ' + P.ROLS[u.rol] + '.'); }
        else sel.value = u.rol;
      });
      return el('tr', null, [
        el('td', null, [u.nom || '—', soc ? el('span', { class: 'tu' }, [' (tu)']) : null]),
        el('td', null, [u.email]), el('td', null, [sel]), el('td', null, [data(u.created_at)]),
        el('td', null, [el('span', { class: 'estat ' + (u.actiu ? 'publicat' : 'arxivat') }, [u.actiu ? 'Actiu' : 'Desactivat'])]),
        el('td', null, [boto(u.actiu ? 'Desactiva' : 'Activa', u.actiu ? 'o' : 'v', async function () {
          if (u.actiu && !window.confirm('Desactivar el compte de ' + (u.nom || u.email) + '? No podrà entrar, però les seves publicacions es conserven.')) return;
          var ok = await escriu(sb.from('profiles').update({ actiu: !u.actiu }).eq('id', u.id));
          if (ok) { avis(u.actiu ? 'Compte desactivat.' : 'Compte activat.'); refresca(); }
        }, { disabled: soc, 'aria-label': (u.actiu ? 'Desactiva ' : 'Activa ') + (u.nom || u.email) })])
      ]);
    });

    var fEmail = el('input', { id: 'c-email', type: 'email', required: true, maxlength: 254, autocomplete: 'off' });
    var fNom = el('input', { id: 'c-nom', type: 'text', maxlength: 100, autocomplete: 'off' });
    var fRol = el('select', { id: 'c-rol', value: 'col_laborador' }, Object.keys(P.ROLS).map(function (k) { return el('option', { value: k }, [P.ROLS[k]]); }));
    var bConvida = el('button', { type: 'submit', class: 'btn' }, ['Envia la invitació']);
    var form = el('form', { novalidate: true, onsubmit: async function (e) {
      e.preventDefault();
      var email = fEmail.value.trim();
      if (!email || !fEmail.checkValidity()) { avis('Escriu un correu electrònic vàlid.', 'error'); fEmail.focus(); return; }
      bConvida.disabled = true;
      try {
        var s = (await sb.auth.getSession()).data.session;
        if (!s) { avis('La sessió ha caducat. Torna a iniciar la sessió.', 'error'); return; }
        var resp = await fetch('/api/convidar', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
          body: JSON.stringify({ email: email, nom: fNom.value.trim(), rol: fRol.value }) });
        var j = await resp.json().catch(function () { return {}; });
        if (!resp.ok) { avis(j.error || 'No s’ha pogut enviar la invitació.', 'error'); return; }
        avis('Invitació enviada a ' + email + '. Rebrà un correu per triar la contrasenya.');
        refresca();
      } catch (err) {
        avis('No s’ha pogut contactar amb el servidor.', 'error');
      } finally { bConvida.disabled = false; }
    } }, [
      el('div', { class: 'graella-form' }, [
        el('div', { class: 'camp' }, [el('label', { for: 'c-email' }, ['Correu electrònic']), fEmail]),
        el('div', { class: 'camp' }, [el('label', { for: 'c-nom' }, ['Nom']), fNom]),
        el('div', { class: 'camp' }, [el('label', { for: 'c-rol' }, ['Rol']), fRol])
      ]),
      bConvida
    ]);

    pinta(t, [
      el('h1', null, ['Usuaris']),
      el('p', null, ['Les contrasenyes no es mostren mai: cada persona tria la seva des del correu d’invitació. No pots canviar el teu propi rol ni desactivar el teu compte.']),
      el('div', { class: 'taula-wrap', tabindex: '0', role: 'region', 'aria-label': 'Llista d’usuaris' }, [
        el('table', { class: 'taula' }, [
          el('thead', null, [el('tr', null, ['Nom', 'Correu', 'Rol', 'Alta', 'Estat', 'Accions'].map(function (x) { return el('th', { scope: 'col' }, [x]); }))]),
          el('tbody', null, files)
        ])]),
      el('h2', null, ['Convida un usuari']),
      form
    ]);
  }

  // ---------- Documents ----------
  async function vDocuments(t) {
    var admin = jo.rol === 'admin';
    var r = await sb.from('documents').select('id,titol,descripcio,enllac,created_at').order('created_at', { ascending: false });
    if (r.error) throw r.error;
    var permisos = {}, usuaris = [];
    if (admin) {
      var pr = await sb.from('permisos_document').select('document_id,usuari_id');
      if (pr.error) throw pr.error;
      (pr.data || []).forEach(function (x) { (permisos[x.document_id] = permisos[x.document_id] || {})[x.usuari_id] = true; });
      var ur = await sb.from('profiles').select('id,nom,email').eq('actiu', true).order('nom');
      if (ur.error) throw ur.error;
      usuaris = ur.data || [];
    }
    var items = (r.data || []).map(function (d) {
      var href = /^https:\/\//i.test(d.enllac) ? S.enllac(d.enllac) : '';
      var fills = [
        el('h3', null, [d.titol]),
        d.descripcio ? el('p', null, [d.descripcio]) : null,
        href ? el('p', null, [el('a', { href: href, target: '_blank', rel: 'noopener noreferrer', class: 'btn o petit' },
          ['Obre el document', el('span', { class: 'tu' }, [' (pestanya nova)'])])]) : null
      ];
      if (admin) {
        var acc = el('details', { class: 'doc-accessos' }, [el('summary', null, ['Qui hi té accés'])].concat(usuaris.map(function (u) {
          var c = el('input', { type: 'checkbox', checked: !!(permisos[d.id] && permisos[d.id][u.id]) });
          c.addEventListener('change', async function () {
            c.disabled = true;
            var ok = c.checked
              ? await escriu(sb.from('permisos_document').insert({ document_id: d.id, usuari_id: u.id }), 'document_id')
              : await escriu(sb.from('permisos_document').delete().eq('document_id', d.id).eq('usuari_id', u.id), 'document_id');
            if (!ok) c.checked = !c.checked; else avis(c.checked ? 'Accés concedit a ' + (u.nom || u.email) + '.' : 'Accés retirat a ' + (u.nom || u.email) + '.');
            c.disabled = false;
          });
          return el('label', null, [c, (u.nom || '—') + ' · ' + u.email + (u.id === jo.id ? ' (tu)' : '')]);
        })));
        fills.push(acc);
        fills.push(el('div', { class: 'accions' }, [boto('Elimina el document', 'o', async function () {
          if (!window.confirm('Segur que vols eliminar el document «' + d.titol + '»?')) return;
          var ok = await escriu(sb.from('documents').delete().eq('id', d.id));
          if (ok) { avis('Document eliminat.'); refresca(); }
        })]));
      }
      return el('li', { class: 'item' }, fills);
    });
    var nodes = [
      el('h1', null, ['Documents']),
      el('p', null, [admin ? 'Com a administrador veus tots els documents i decideixes qui hi té accés.' : 'Documents interns que t’han compartit.']),
      items.length ? el('ul', { class: 'llista' }, items) : buit(admin ? 'Encara no hi ha cap document.' : 'No tens cap document disponible.')
    ];
    if (admin) {
      var dT = el('input', { id: 'd-titol', type: 'text', maxlength: 200, required: true });
      var dD = el('textarea', { id: 'd-desc', maxlength: 1000 });
      var dE = el('input', { id: 'd-enllac', type: 'url', required: true, placeholder: 'https://', 'aria-describedby': 'd-enllac-ajuda' });
      nodes.push(el('h2', null, ['Afegeix un document']));
      nodes.push(el('form', { novalidate: true, onsubmit: async function (e) {
        e.preventDefault();
        var tt = dT.value.trim(), en = dE.value.trim();
        if (!tt) { avis('El títol és obligatori.', 'error'); dT.focus(); return; }
        if (!/^https:\/\/\S+$/i.test(en) || !S.enllac(en)) { avis('L’enllaç ha de començar per https://', 'error'); dE.focus(); return; }
        var ok = await escriu(sb.from('documents').insert({ titol: tt, descripcio: dD.value.trim(), enllac: en, created_by: jo.id }));
        if (ok) { avis('Document afegit. Ara marca qui hi té accés.'); refresca(); }
      } }, [
        el('div', { class: 'camp' }, [el('label', { for: 'd-titol' }, ['Títol']), dT]),
        el('div', { class: 'camp' }, [el('label', { for: 'd-desc' }, ['Descripció']), dD]),
        el('div', { class: 'camp' }, [el('label', { for: 'd-enllac' }, ['Enllaç']), dE,
          el('span', { class: 'ajuda', id: 'd-enllac-ajuda' }, ['Adreça https:// del document (per exemple, una carpeta compartida).'])]),
        el('button', { type: 'submit', class: 'btn' }, ['Afegeix el document'])
      ]));
    }
    pinta(t, nodes);
  }

  // ---------- encaminador ----------
  async function encamina() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    var nom = h[0] || 'inici', arg = h[1] || '';
    var t = ++torn;
    var def = RUTES.filter(function (x) { return x.r === (nom === 'editar' ? 'nova' : nom); })[0];
    Array.prototype.forEach.call(menuUl.querySelectorAll('a'), function (a) {
      if (a.getAttribute('data-r') === (nom === 'editar' ? '' : (def && def.pare) || nom)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    nav.classList.remove('open'); mbp.setAttribute('aria-expanded', 'false');
    if (!def) { pinta(t, [el('h1', null, ['No hem trobat aquesta secció.']), el('p', null, [enllacRuta('Torna a l’inici', 'inici')])]); vista.focus(); return; }
    if (!pot(def.rols)) { pinta(t, [el('h1', null, ['No tens accés a aquesta secció.']), el('p', null, [enllacRuta('Torna a l’inici', 'inici')])]); vista.focus(); return; }
    document.title = (nom === 'editar' ? 'Publicació' : def.t) + ' · Àrea privada · Defensem l’Empordanet';
    pinta(t, [el('p', null, ['Carregant…'])]);
    try { await def.f(t, arg, h[2] || ''); }
    catch (e) { pinta(t, [el('h1', null, [def.t]), el('p', { class: 'msg error' }, [P.errorText(e)])]); }
    if (t === torn) vista.focus({ preventScroll: true });
  }

  function construeixMenu() {
    menuUl.textContent = '';
    RUTES.forEach(function (x) {
      if (pot(x.rols) && !x.pare) menuUl.appendChild(el('li', null, [el('a', { href: '#/' + x.r, 'data-r': x.r }, [x.t])]));
    });
  }

  // Claus de la sessió de Supabase al navegador (sb-<projecte>-auth-token…).
  function clausSessio() {
    try { return Object.keys(localStorage).filter(function (k) { return k.indexOf('sb-') === 0 && k.indexOf('auth-token') !== -1; }); } catch (e) { return []; }
  }
  function netejaSessio() {
    clausSessio().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* emmagatzematge no disponible */ } });
  }
  function copiaSessio() {
    var c = {};
    clausSessio().forEach(function (k) { try { c[k] = localStorage.getItem(k); } catch (e) { /* idem */ } });
    return c;
  }
  function restauraSessio(c) {
    Object.keys(c).forEach(function (k) { try { localStorage.setItem(k, c[k]); } catch (e) { /* idem */ } });
  }
  // Una sola redirecció: per defecte a la web pública; a l'inici de sessió si la sessió no és vàlida en obrir el tauler.
  function surt(desti) {
    if (surt.fet) return;
    surt.fet = true;
    location.replace(desti || '/');
  }

  async function inicia() {
    if (!sb) { pinta(torn, [el('h1', null, ['Àrea privada']), el('p', { class: 'msg error' }, [P.NO_CONFIG])]); return; }
    var s;
    try { s = (await sb.auth.getSession()).data.session; } catch (e) { s = null; }
    if (!s) { surt('/area-privada/'); return; }
    var r = await sb.from('profiles').select('id,email,nom,rol,actiu').eq('id', s.user.id).maybeSingle();
    if (r.error && (r.status === 401 || /JWT/i.test(r.error.message || ''))) { netejaSessio(); surt('/area-privada/'); return; }
    if (r.error) { pinta(torn, [el('h1', null, ['Àrea privada']), el('p', { class: 'msg error' }, [P.errorText(r.error)])]); return; }
    if (!r.data || r.data.actiu !== true) { await sb.auth.signOut(); location.replace('/area-privada/?m=desactivat'); return; }
    jo = r.data;
    document.getElementById('u-nom').textContent = jo.nom || jo.email;
    document.getElementById('u-rol').textContent = P.ROLS[jo.rol] || jo.rol;
    document.getElementById('usuari').hidden = false;
    // supabase-js esborra la sessió local encara que el servidor falli. Si falla, la restaurem perquè
    // l'usuari vegi l'error i ho pugui tornar a provar: no fem veure que s'ha tancat.
    var tancant = false;
    document.getElementById('sortir').addEventListener('click', async function () {
      var boto = this, r, copia = copiaSessio();
      boto.disabled = true;
      tancant = true;
      try { r = await sb.auth.signOut(); } catch (e) { r = { error: e }; }
      tancant = false;
      if (r && r.error) {
        restauraSessio(copia);
        boto.disabled = false;
        avis('No s’ha pogut tancar la sessió. Comprova la connexió i torna-ho a provar.', 'error', true);
        return;
      }
      netejaSessio();
      surt('/');
    });
    mbp.addEventListener('click', function () {
      var o = !nav.classList.contains('open');
      nav.classList.toggle('open', o); mbp.setAttribute('aria-expanded', String(o));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { nav.classList.remove('open'); mbp.setAttribute('aria-expanded', 'false'); } });
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && !tancant) { netejaSessio(); surt('/'); } });
    // Si el navegador torna al tauler des de la memòria cau (botó «enrere»), cal tornar a comprovar la sessió.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      surt.fet = false;
      sb.auth.getSession().then(function (x) { if (!(x.data && x.data.session)) surt('/area-privada/'); }, function () { surt('/area-privada/'); });
    });
    construeixMenu();
    window.addEventListener('hashchange', encamina);
    encamina();
  }

  inicia();
})();
