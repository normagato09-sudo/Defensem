/* Triar o restablir la contrasenya. S'hi arriba des del correu d'invitació, des del correu de
   recuperació o des del tauler (amb la sessió iniciada). */
(function () {
  'use strict';
  var P = window.Privat;
  var msg = document.getElementById('msg'), form = document.getElementById('f-pw');
  var CADUCAT = 'L\'enllaç ha caducat o no és vàlid.';

  var sb = P.client({ detectSessionInUrl: true });
  if (!sb) { P.missatge(msg, P.NO_CONFIG, 'error'); return; }

  var errorUrl = new URLSearchParams(location.hash.slice(1)).get('error') || new URLSearchParams(location.search).get('error');

  // Espera que el client llegeixi la sessió de l'enllaç (PASSWORD_RECOVERY / SIGNED_IN), amb un límit de temps.
  function esperaSessio(ms) {
    return new Promise(function (resol) {
      var fet = false;
      function fi(s) { if (!fet) { fet = true; resol(s); } }
      sb.auth.onAuthStateChange(function (ev, s) {
        if (s && (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION')) fi(s);
      });
      sb.auth.getSession().then(function (r) { if (r.data && r.data.session) fi(r.data.session); }).catch(function () {});
      setTimeout(function () { fi(null); }, ms);
    });
  }

  esperaSessio(errorUrl ? 0 : 5000).then(function (s) {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (!s) { P.missatge(msg, CADUCAT, 'error'); return; }
    P.missatge(msg, 'Escriu la contrasenya nova dues vegades.');
    form.hidden = false;
    form.pw1.focus();
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var a = form.pw1.value, b = form.pw2.value;
    if (a.length < 10) { P.missatge(msg, 'La contrasenya ha de tenir com a mínim 10 caràcters.', 'error'); form.pw1.focus(); return; }
    if (a !== b) { P.missatge(msg, 'Les dues contrasenyes no coincideixen.', 'error'); form.pw2.focus(); return; }
    var boto = form.querySelector('button[type=submit]');
    boto.disabled = true;
    try {
      var r = await sb.auth.updateUser({ password: a });
      if (r.error) { P.missatge(msg, P.errorAuth(r.error), 'error'); return; }
      form.hidden = true;
      P.missatge(msg, 'Contrasenya desada. Entrant a l’àrea privada…');
      location.replace('/area-privada/panel.html');
    } catch (err) {
      P.missatge(msg, P.errorAuth(err), 'error');
    } finally {
      boto.disabled = false;
    }
  });
})();
