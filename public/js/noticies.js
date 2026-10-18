/* Les notícies es llegeixen de /noticies.json (llista buida = estat buit).
   Cada notícia: {"titol":"","data":"AAAA-MM-DD","descripcio":"","enllac":"https://…","imatge":"/img/fitxer.jpg"} */
(function(){
var box=document.getElementById('news');
if(!box)return;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x)e.textContent=x;return e}
function buit(t){box.textContent='';box.appendChild(el('p','buit',t))}
var MSG='Encara no hi ha notícies publicades. Aviat compartirem novetats sobre la defensa de l’Empordanet.';
fetch('/noticies.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){
if(!Array.isArray(l)||!l.length){buit(MSG);return}
l.sort(function(a,b){return (b.data||'').localeCompare(a.data||'')});
box.textContent='';
l.forEach(function(n){
var c=el('article','card'),im=el('div','im');
if(n.imatge){var i=document.createElement('img');i.src=n.imatge;i.alt='';i.loading='lazy';i.onerror=function(){i.remove()};im.appendChild(i)}
c.appendChild(im);
var t=el('div','tx');
if(n.data){var d=new Date(n.data+'T12:00:00'),tm=el('time','',isNaN(d)?n.data:d.toLocaleDateString('ca-ES',{day:'numeric',month:'long',year:'numeric'}));tm.setAttribute('datetime',n.data);t.appendChild(tm)}
t.appendChild(el('h3','',n.titol||''));
t.appendChild(el('p','',n.descripcio||''));
if(n.enllac){var a=el('a','mes','Llegeix-ne més');a.href=n.enllac;if(/^https?:/.test(n.enllac)){a.target='_blank';a.rel='noopener'}t.appendChild(a)}
c.appendChild(t);box.appendChild(c)});
}).catch(function(){buit(MSG)});
})();
