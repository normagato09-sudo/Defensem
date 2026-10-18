/* Notícies de la portada.
   - Si Supabase està configurat (js/config.js), es llegeixen de la vista pública publicacions_publiques
     (només contingut publicat; mai esborranys ni pendents).
   - Si no, es llegeixen de /noticies.json (llista buida = estat buit).
     Cada notícia: {"titol":"","data":"AAAA-MM-DD","descripcio":"","enllac":"https://…","imatge":"/img/fitxer.jpg"} */
(function(){
var box=document.getElementById('news');
if(!box)return;
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
if(n.enllac){var a=el('a','mes','Llegeix-ne més');a.href=n.enllac;if(/^https?:/.test(n.enllac)){a.target='_blank';a.rel='noopener'}t.appendChild(a)}
c.appendChild(t);return c}
function pinta(l){
if(!l.length){buit(MSG);return}
box.textContent='';
l.forEach(function(n){box.appendChild(targeta(n))})}
function deJson(){
return fetch('/noticies.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){
if(!Array.isArray(l))l=[];
l.sort(function(a,b){return (b.data||'').localeCompare(a.data||'')});
pinta(l.map(function(n){
var d=n.data?new Date(n.data+'T12:00:00'):null;
return {titol:n.titol,descripcio:n.descripcio,enllac:n.enllac,imatge:n.imatge,data:n.data,
dataText:d&&!isNaN(d)?d.toLocaleDateString('ca-ES',{day:'numeric',month:'long',year:'numeric'}):n.data}}))})}
var S=window.Segur,cfg=S&&S.config();
if(!cfg){deJson().catch(function(){buit(MSG)});return}
fetch(cfg.url+'/rest/v1/publicacions_publiques?select=id,tipus,titol,resum,imatge,published_at&order=published_at.desc&limit=30',
{headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key}})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){
if(!Array.isArray(l))throw 0;
pinta(l.filter(function(n){return S.esUuid(n.id)}).map(function(n){
return {titol:n.titol,descripcio:n.resum,imatge:S.urlImatge(null,n.imatge),
data:n.published_at||'',dataText:S.dataCurta(n.published_at),
etiqueta:n.tipus==='comunicat'?'Comunicat':'',enllac:'/noticia.html?id='+n.id}}))})
.catch(function(){deJson().catch(function(){buit(MSG)})});
})();
