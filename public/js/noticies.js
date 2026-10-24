/* Notícies d'/actualitat.html: les 6 més recents en targetes compactes (imatge, data, títol i 2 línies) i el botó
   «Carrega'n més», que n'afegeix 6 més cada vegada (paginació amb limit/offset a Supabase).
   - Si Supabase està configurat (js/config.js), es llegeixen de la vista pública publicacions_publiques
     (només contingut publicat; mai esborranys ni pendents).
   - Si no, es llegeixen de /noticies.json (llista buida = estat buit).
     Cada notícia: {"titol":"","data":"AAAA-MM-DD","descripcio":"","enllac":"https://…","imatge":"/img/fitxer.jpg"}
   - Les imatges es carreguen tard (lazy), amb mida fixada (sense salts) i, en pujar-les des de l'app, ja es redueixen.
     Si el projecte de Supabase té les transformacions d'imatge actives (plans de pagament), posa
     imatgesReduides: true a js/config.js i les targetes demanaran una versió de 640 px.
   - Cada notícia té la seva pàgina noticia.html?id=… */
(function(){
var box=document.getElementById('news');
if(!box)return;
var mes=document.getElementById('news-mes');
var PER=parseInt(box.getAttribute('data-per-carrega'),10)||6;
var carregades=0,total=0,json=null;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x)e.textContent=x;return e}
function buit(t){box.textContent='';box.appendChild(el('p','buit',t))}
var MSG='Encara no hi ha notícies publicades. Aviat compartirem novetats sobre la defensa de l’Empordanet.';
function imatge(n){
var i=document.createElement('img');i.alt='';i.loading='lazy';i.decoding='async';i.width=640;i.height=360;
var src=n.imatgePetita||n.imatge;i.src=src;
i.onerror=function(){if(n.imatgePetita&&i.src.indexOf('/render/image/')!==-1){i.src=n.imatge}else{i.remove()}};
return i}
function targeta(n){
var c=el('article','card card-compacta'),im=el('div','im');
if(n.imatge)im.appendChild(imatge(n));
c.appendChild(im);
var t=el('div','tx');
if(n.etiqueta)t.appendChild(el('span','etiq',n.etiqueta));
if(n.data){var tm=el('time','',n.dataText);tm.setAttribute('datetime',n.data);t.appendChild(tm)}
var h=el('h3');
if(n.enllac){var a=el('a','',n.titol||'');a.href=n.enllac;if(/^https?:/.test(n.enllac)){a.target='_blank';a.rel='noopener'}h.appendChild(a)}else h.textContent=n.titol||'';
t.appendChild(h);
if(n.descripcio)t.appendChild(el('p','resum-2',n.descripcio));
c.appendChild(t);return c}
function afegeix(l){
if(!carregades)box.textContent='';
l.forEach(function(n){box.appendChild(targeta(n))});
carregades+=l.length;
if(!carregades)buit(MSG);
if(mes)mes.hidden=carregades>=total}
function deJson(){
var p=json?Promise.resolve(json):fetch('/noticies.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){
if(!Array.isArray(l))l=[];
l.sort(function(a,b){return (b.data||'').localeCompare(a.data||'')});
json=l;return l});
return p.then(function(l){
total=l.length;
afegeix(l.slice(carregades,carregades+PER).map(function(n){
var d=n.data?new Date(n.data+'T12:00:00'):null;
return {titol:n.titol,descripcio:n.descripcio,enllac:n.enllac,imatge:n.imatge,data:n.data,
dataText:d&&!isNaN(d)?d.toLocaleDateString('ca-ES',{day:'numeric',month:'long',year:'numeric'}):n.data}}))})}
var S=window.Segur,cfg=S&&S.config();
function deSupabase(){
return fetch(cfg.url+'/rest/v1/publicacions_publiques?select=id,tipus,titol,resum,imatge,published_at&order=published_at.desc&limit='+PER+'&offset='+carregades,
{headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,Prefer:'count=exact'}})
.then(function(r){if(!r.ok)throw 0;
var m=/\/(\d+)$/.exec(r.headers.get('content-range')||'');
return r.json().then(function(l){if(!Array.isArray(l))throw 0;total=m?parseInt(m[1],10):carregades+l.length+(l.length===PER?1:0);return l})})
.then(function(l){
afegeix(l.filter(function(n){return S.esUuid(n.id)}).map(function(n){
var gran=S.urlImatge(null,n.imatge);
return {titol:n.titol,descripcio:n.resum,imatge:gran,imatgePetita:gran&&window.DEFENSEM&&window.DEFENSEM.imatgesReduides?gran.replace('/storage/v1/object/public/','/storage/v1/render/image/public/')+'?width=640&quality=70':'',
data:n.published_at||'',dataText:S.dataCurta(n.published_at),
etiqueta:n.tipus==='comunicat'?'Comunicat':'',enllac:'/noticia.html?id='+n.id}}))})}
var carrega=cfg?function(){return deSupabase().catch(function(){if(!carregades)return deJson()})}:deJson;
function primer(){carrega().catch(function(){buit(MSG)})}
if(mes)mes.addEventListener('click',function(){
mes.disabled=true;
var abans=box.children.length;
carrega().catch(function(){}).then(function(){mes.disabled=false;var nou=box.children[abans];if(nou){var a=nou.querySelector('a');if(a)a.focus()}})});
primer();
})();
