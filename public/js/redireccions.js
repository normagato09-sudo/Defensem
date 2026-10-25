/* Enllaços antics amb àncora (/#noticies, /#agenda, /actualitat.html#agenda…, /entitats.html#eines) → pàgina nova de cada secció.
   (Les pàgines antigues /noticies.html, /recursos.html, /contacte.html… les redirigeix el servidor: vegeu vercel.json.
   El navegador conserva l'àncora en una redirecció: /recursos.html#eines arriba aquí com a /entitats.html#eines.)
   L'àncora (#…) no arriba mai al servidor, per això es fa aquí, abans de pintar res.
   #contacte no es redirigeix: el correu i Instagram són al peu de totes les pàgines.
   El minijoc és una app a part, a /joc. */
(function () {
  var NOU = {
    '/': {
      '#qui-som': '/qui-som.html', '#el-projecte': '/projecte-la-tallada.html', '#preguntes': '/qui-som.html#preguntes',
      '#noticies': '/noticies-defensem.html', '#agenda': '/agenda.html',
      '#entitats': '/entitats.html', '#eines': '/eines.html', '#joc': '/joc'
    },
    '/qui-som.html': { '#el-projecte': '/projecte-la-tallada.html' },
    '/actualitat.html': { '#agenda': '/agenda.html' },
    '/entitats.html': { '#eines': '/eines.html' }
  };
  var desti = (NOU[location.pathname] || {})[location.hash];
  if (desti) location.replace(desti);
})();
