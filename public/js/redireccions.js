/* Enllaços antics amb àncora (/#noticies, /#agenda…, /entitats.html#eines) → pàgina nova de cada secció.
   (Les pàgines antigues /noticies.html, /recursos.html, /contacte.html… les redirigeix el servidor: vegeu vercel.json.
   El navegador conserva l'àncora en una redirecció: /recursos.html#eines arriba aquí com a /entitats.html#eines.)
   L'àncora (#…) no arriba mai al servidor, per això es fa aquí, abans de pintar res.
   #actua i #contacte no es redirigeixen: «Què hi pots fer», el correu i Instagram són al peu de totes les pàgines.
   El minijoc és una app a part, a /joc. */
(function () {
  var NOU = {
    '/': {
      '#qui-som': '/qui-som.html', '#el-projecte': '/qui-som.html#el-projecte', '#preguntes': '/qui-som.html#preguntes',
      '#noticies': '/noticies-defensem.html', '#agenda': '/actualitat.html#agenda',
      '#entitats': '/entitats.html', '#eines': '/eines.html', '#joc': '/joc'
    },
    '/entitats.html': { '#eines': '/eines.html' }
  };
  var desti = (NOU[location.pathname] || {})[location.hash];
  if (desti) location.replace(desti);
})();
