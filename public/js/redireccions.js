/* Enllaços antics de la portada llarga (/#noticies, /#agenda…) → pàgina nova de cada secció.
   L'àncora (#…) no arriba mai al servidor, per això es fa aquí, abans de pintar res. */
(function () {
  var NOU = {
    '#qui-som': '/qui-som.html', '#el-projecte': '/projecte.html', '#preguntes': '/projecte.html#preguntes',
    '#joc': '/projecte.html#joc', '#agenda': '/agenda.html', '#noticies': '/noticies.html',
    '#actua': '/contacte.html#actua', '#contacte': '/contacte.html'
  };
  var desti = NOU[location.hash];
  if (desti) location.replace(desti);
})();
