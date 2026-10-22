/* Agenda de Defensem l'Empordanet.
   Els actes s'escriuen a l'HTML, dins de <ol id="actes">, cada un amb data-fins="AAAA-MM-DD" (l'últim dia de l'acte).
   Aquest script, en carregar la pàgina:
   - deixa a dalt els actes que encara no han passat (el més proper primer),
   - mou els passats a «Actes anteriors» (el més recent primer),
   - si no en queda cap de proper, mostra l'avís #agenda-buit.
   Sense JavaScript, es veuen tots els actes en una sola llista. */
(function () {
  'use strict';
  var llista = document.getElementById('actes');
  if (!llista) return;
  var fets = document.getElementById('actes-fets');
  var anteriors = document.getElementById('actes-anteriors');
  var buit = document.getElementById('agenda-buit');

  var d = new Date();
  var avui = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

  var actes = Array.prototype.slice.call(llista.querySelectorAll('li[data-fins]'));
  actes.sort(function (a, b) { return a.getAttribute('data-fins') < b.getAttribute('data-fins') ? -1 : 1; });
  var propers = actes.filter(function (a) { return a.getAttribute('data-fins') >= avui; });
  var passats = actes.filter(function (a) { return a.getAttribute('data-fins') < avui; }).reverse();

  propers.forEach(function (a) { llista.appendChild(a); });
  if (fets) passats.forEach(function (a) { fets.appendChild(a); });
  if (anteriors) anteriors.hidden = passats.length === 0;
  if (buit) buit.hidden = propers.length > 0;
  llista.hidden = propers.length === 0;
})();

