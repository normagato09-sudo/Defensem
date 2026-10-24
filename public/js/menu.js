/* Menú principal (el posa /js/marc.js).
   - Botó «Menú» (mòbil i tauleta): obre i tanca el menú.
   - Desplegables (Actualitat, Projectes, Recursos): el botó de cada un obre i tanca el seu submenú. En escriptori
     s'obre a sobre de la pàgina; en mòbil, com un acordió dins del menú. Només n'hi ha un d'obert alhora.
   - Escape tanca el submenú obert (i torna el focus al seu botó) o el menú; un clic fora també els tanca. */
(function(){
var b=document.getElementById('mb'),n=document.getElementById('nav');
if(!b||!n)return;
var desps=Array.prototype.slice.call(n.querySelectorAll('.desp'));
function boto(d){return d.querySelector('.desp-b')}
function obre(d,o){d.classList.toggle('obert',o);boto(d).setAttribute('aria-expanded',String(o))}
function tancaSubs(excepte){desps.forEach(function(d){if(d!==excepte)obre(d,false)})}
function set(o){n.classList.toggle('open',o);b.setAttribute('aria-expanded',String(o));if(!o)tancaSubs()}
b.addEventListener('click',function(){set(!n.classList.contains('open'))});
desps.forEach(function(d){
  boto(d).addEventListener('click',function(e){e.stopPropagation();var o=!d.classList.contains('obert');tancaSubs(d);obre(d,o)});
});
// En mòbil, el submenú de la pàgina actual ja surt obert en obrir el menú.
b.addEventListener('click',function(){if(n.classList.contains('open'))desps.forEach(function(d){if(d.classList.contains('actiu'))obre(d,true)})});
n.addEventListener('click',function(e){if(e.target.closest('a'))set(false)});
document.addEventListener('click',function(e){if(!n.contains(e.target)&&e.target!==b){tancaSubs();if(n.classList.contains('open'))set(false)}});
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  var ob=desps.filter(function(d){return d.classList.contains('obert')})[0];
  if(ob&&!n.classList.contains('open')){obre(ob,false);boto(ob).focus();return}
  if(n.classList.contains('open')){set(false);b.focus()}else tancaSubs();
});
})();
