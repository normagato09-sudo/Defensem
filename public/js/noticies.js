/* Notícies: a la portada (les últimes, data-limit="3") i a /noticies.html (totes, per pàgines: data-per-pagina="9").
   - Si Supabase està configurat (js/config.js), es llegeixen de la vista pública publicacions_publiques
     (només contingut publicat; mai esborranys ni pendents).
   - Si no, es llegeixen de /noticies.json (llista buida = estat buit).
     Cada notícia: {"titol":"","data":"AAAA-MM-DD","descripcio":"","enllac":"https://…","imatge":"/img/fitxer.jpg"}
   - La pàgina es tria amb ?pagina=N a l'adreça. */
(function(){
var box=document.getElementById('news');
if(!box)return;
var nav=document.getElementById('paginacio');
var limit=parseInt(box.getAttribute('data-limit'),10)||0;
var perPagina=parseInt(box.getAttribute('data-per-pagina'),10)||0;
var pagina=Math.max(1,parseInt(new URLSearchParams(location.search).get('pagina'),10)||1);
if(!perPagina)pagina=1;
var mida=limit||perPagina||30,desde=(pagina-1)*mida;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x)e.textContent=x;return e}
function buit(t){box.textContent='';box.appendChild(el('p','buit',t))}
var MSG='Encara no hi ha notícies publicades. Aviat compartirem novetats sobre la defensa de l’Empordanet.';
function targeta(n){
var c=el('article','card'),im=el('div','im');
if(n.imatge){var i=document.createElement('img');i.src=n.imatge;i.alt='';i.loading='lazy';i.onerror=function(){i.remove()};im.appendChild(i)}
c.appendChild(im);
var t=el('div','tx');
if(n.etiqueta)t.appendChild(el('span','etiq',n.etiqueta));
if(n.data){var tm=el('time','',n.dataText);tm.setAttribute('datetime',n.data);t.appendChild(tm)}
t.appendChild(el('h3','',n.titol||''));
t.appendChild(el('p','',n.descripcio||''));
if(n.enllac){var a=el('a','mes','Llegeix-ne més');a.href=n.enllac;a.setAttribute('aria-label','Llegeix-ne més: '+(n.titol||''));if(/^https?:/.test(n.enllac)){a.target='_blank';a.rel='noopener'}t.appendChild(a)}
c.appendChild(t);return c}
function enllacPagina(p,text,etiqueta){
var a=el('a','pag',text);a.href='/noticies.html'+(p>1?'?pagina='+p:'');
if(etiqueta)a.setAttribute('aria-label',etiqueta);
if(p===pagina)a.setAttribute('aria-current','page');
return a}
function paginacio(total){
if(!nav||!perPagina)return;
var pagines=Math.ceil(total/perPagina);
nav.textContent='';
if(pagines<=1){nav.hidden=true;return}
if(pagina>1)nav.appendChild(enllacPagina(pagina-1,'← Anteriors','Pàgina anterior'));
for(var p=1;p<=pagines;p++)nav.appendChild(enllacPagina(p,String(p),'Pàgina '+p));
if(pagina<pagines)nav.appendChild(enllacPagina(pagina+1,'Següents →','Pàgina següent'));
nav.hidden=false}
function pinta(l,total){
if(!l.length){buit(total>0?'Aquesta pàgina no existeix. Torna a la primera pàgina de notícies.':MSG);paginacio(total);return}
box.textContent='';
l.forEach(function(n){box.appendChild(targeta(n))});
paginacio(total)}
function deJson(){
return fetch('/noticies.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){
if(!Array.isArray(l))l=[];
l.sort(function(a,b){return (b.data||'').localeCompare(a.data||'')});
pinta(l.slice(desde,desde+mida).map(function(n){
var d=n.data?new Date(n.data+'T12:00:00'):null;
return {titol:n.titol,descripcio:n.descripcio,enllac:n.enllac,imatge:n.imatge,data:n.data,
dataText:d&&!isNaN(d)?d.toLocaleDateString('ca-ES',{day:'numeric',month:'long',year:'numeric'}):n.data}}),l.length)})}
var S=window.Segur,cfg=S&&S.config();
if(!cfg){deJson().catch(function(){buit(MSG)});return}
var total=0;
fetch(cfg.url+'/rest/v1/publicacions_publiques?select=id,tipus,titol,resum,imatge,published_at&order=published_at.desc&limit='+mida+'&offset='+desde,
{headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,Prefer:'count=exact'}})
.then(function(r){if(!r.ok)throw 0;
var m=/\/(\d+)$/.exec(r.headers.get('content-range')||'');total=m?parseInt(m[1],10):0;
return r.json()}).then(function(l){
if(!Array.isArray(l))throw 0;
pinta(l.filter(function(n){return S.esUuid(n.id)}).map(function(n){
return {titol:n.titol,descripcio:n.resum,imatge:S.urlImatge(null,n.imatge),
data:n.published_at||'',dataText:S.dataCurta(n.published_at),
etiqueta:n.tipus==='comunicat'?'Comunicat':'',enllac:'/noticia.html?id='+n.id}}),Math.max(total,desde+l.length))})
.catch(function(){deJson().catch(function(){buit(MSG)})});
})();
