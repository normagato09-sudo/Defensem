/* Formulari de contacte (/contacte.html): desa el missatge a la taula «missatges_contacte» de Supabase
   (només inserció, sense lectura; el llegeixen admin i editor a l'àrea privada → Missatges).
   Antispam: camp parany ocult i temps mínim d'emplenament aquí, i límits per correu i per hora a la base de dades. */
(function () {
  'use strict';
  var form = document.getElementById('ct-form');
  if (!form) return;
  var S = window.Segur, cfg = S && S.config();
  var msg = document.getElementById('ct-msg'), envia = document.getElementById('ct-envia');
  var obert = Date.now();
  function missatge(t, error) { msg.textContent = t || ''; msg.classList.toggle('error', !!error); }
  function valor(id) { return document.getElementById(id).value.trim(); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    missatge('');
    var camps = ['ct-nom', 'ct-email', 'ct-missatge'];
    for (var i = 0; i < camps.length; i++) {
      var c = document.getElementById(camps[i]);
      if (!c.value.trim()) { missatge('Omple tots els camps obligatoris (*).', true); c.focus(); return; }
    }
    var email = document.getElementById('ct-email');
    if (!email.checkValidity() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { missatge('Escriu un correu electrònic vàlid.', true); email.focus(); return; }
    var consent = document.getElementById('ct-consent');
    if (!consent.checked) { missatge('Cal que acceptis la informació sobre protecció de dades per enviar el missatge.', true); consent.focus(); return; }
    // Parany: les persones no veuen aquest camp. Si s'omple o s'envia en menys de 3 s, fem veure que s'ha enviat.
    if (valor('ct-lloc') || Date.now() - obert < 3000) { form.reset(); missatge('Gràcies! Hem rebut el teu missatge.'); return; }
    if (!cfg) { missatge('El formulari encara no està disponible. Escriu-nos a defensemlempordanet@gmail.com.', true); return; }
    envia.disabled = true;
    fetch(cfg.url + '/rest/v1/missatges_contacte', {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ nom: valor('ct-nom'), email: email.value.trim(), missatge: valor('ct-missatge'), consentiment: true })
    }).then(function (r) {
      if (r.ok) { form.reset(); obert = Date.now(); missatge('Gràcies! Hem rebut el teu missatge. Et respondrem al correu que ens has donat.'); msg.focus(); return; }
      return r.json().catch(function () { return {}; }).then(function (j) {
        // Els missatges dels límits antispam (P0001) ja arriben en català des de la base de dades.
        missatge(j && j.code === 'P0001' && j.message ? j.message
          : 'No s’ha pogut enviar el missatge. Torna-ho a provar o escriu-nos a defensemlempordanet@gmail.com.', true);
      });
    }).catch(function () {
      missatge('No s’ha pogut connectar. Comprova la connexió i torna-ho a provar.', true);
    }).then(function () { envia.disabled = false; });
  });
})();
