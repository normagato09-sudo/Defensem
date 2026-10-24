/* Enllaços antics de la portada llarga (/#noticies, /#agenda…) → pàgina nova de cada secció.
   (Les pàgines antigues /noticies.html, /agenda.html… les redirigeix el servidor: vegeu vercel.json.)
   L'àncora (#…) no arriba mai al servidor, per això es fa aquí, abans de pintar res. El minijoc (#joc) és a la portada. */
(function () {
  var NOU = {
    '#qui-som': '/qui-som.html', '#el-projecte': '/qui-som.html#el-projecte', '#preguntes': '/qui-som.html#preguntes',
    '#noticies': '/actualitat.html#noticies', '#agenda': '/actualitat.html#agenda',
    '#entitats': '/recursos.html#entitats', '#eines': '/recursos.html#eines',
    '#actua': '/contacte.html#actua', '#contacte': '/contacte.html'
  };
  var desti = NOU[location.hash];
  if (desti) location.replace(desti);
})();
