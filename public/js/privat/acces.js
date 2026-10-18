/* Pàgina d'inici de sessió de l'àrea privada. No hi ha registre: els comptes els convida un administrador. */
(function () {
  'use strict';
  var P = window.Privat;
  var form = document.getElementById('f-login'), msg = document.getElementById('msg');
  var formRec = document.getElementById('f-recupera'), msgRec = document.getElementById('msg-rec');
  var obreRec = document.getElementById('obre-rec');
  var PANEL = '/area-privada/panel.html';

  if (new URLSearchParams(location.search).get('m') === 'desactivat') P.missatge(msg, 'Aquest compte està desactivat.', 'error');

  obreRec.addEventListener('click', function () {
    var obrir = formRec.hidden;
    formRec.hidden = !obrir;
    obreRec.setAttribute('aria-expanded', String(obrir));
    if (obrir) document.getElementById('email-rec').focus();
  });

  var sb = P.client();
  if (!sb) {
    P.missatge(msg, P.NO_CONFIG, 'error');
    Array.prototype.forEach.call(document.querySelectorAll('form input, form button'), function (e) { e.disabled = true; });
    return;
  }

  // Comprova el perfil a la base de dades: un compte desactivat no entra.
  async function entra(uid) {
    var r = await sb.from('profiles').select('actiu').eq('id', uid).maybeSingle();
    if (r.error) { P.missatge(msg, P.errorText(r.error), 'error'); return false; }
    if (!r.data || r.data.actiu !== true) {
      await sb.auth.signOut();
      P.missatge(msg, 'Aquest compte està desactivat.', 'error');
      return false;
    }
    location.replace(PANEL);
    return true;
  }

  // Si ja hi ha sessió, cap al tauler.
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) entra(s.user.id);
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var boto = form.querySelector('button[type=submit]');
    var email = form.email.value.trim(), pw = form.contrasenya.value;
    if (!email || !pw) { P.missatge(msg, 'Escriu el correu i la contrasenya.', 'error'); return; }
    boto.disabled = true;
    P.missatge(msg, 'Comprovant…');
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) { P.missatge(msg, P.errorAuth(r.error), 'error'); form.contrasenya.select(); return; }
      await entra(r.data.user.id);
    } catch (err) {
      P.missatge(msg, P.errorAuth(err), 'error');
    } finally {
      boto.disabled = false;
    }
  });

  formRec.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = formRec.email.value.trim();
    if (!email) { P.missatge(msgRec, 'Escriu el teu correu.', 'error'); return; }
    var boto = formRec.querySelector('button[type=submit]');
    boto.disabled = true;
    try {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/area-privada/contrasenya.html' });
    } catch (err) { /* el missatge és sempre el mateix: no revela si el correu existeix */ }
    P.missatge(msgRec, 'Si el correu existeix, rebràs un enllaç per restablir la contrasenya.');
    boto.disabled = false;
  });
})();
