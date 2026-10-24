/* Pàgina d'una notícia o comunicat: /noticia.html?id=<uuid>
   Només es llegeix de la vista pública (contingut publicat). El cos es neteja amb Segur.neteja. */
(function(){
var main=document.querySelector('main.noticia');
if(!main)return;
var S=window.Segur;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x)e.textContent=x;return e}
function noTrobada(){
main.textContent='';
main.appendChild(el('p','kicker','Actualitat'));
main.appendChild(el('h1','','No hem trobat aquesta publicació.'));
var p=el('p'),a=el('a','','Torna a les notícies');a.href='/noticies.html';p.appendChild(a);main.appendChild(p);
}
var id=new URLSearchParams(location.search).get('id');
var cfg=S&&S.config();
if(!cfg||!S.esUuid(id)){noTrobada();return}
fetch(cfg.url+'/rest/v1/publicacions_publiques?select=id,tipus,titol,resum,contingut,imatge,published_at&id=eq.'+encodeURIComponent(id),
{headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key}})
.then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){
var n=Array.isArray(l)&&l[0];
if(!n){noTrobada();return}
document.title=(n.titol||'Notícia')+' · Defensem l’Empordanet';
main.textContent='';
main.appendChild(el('p','kicker',n.tipus==='comunicat'?'Comunicat':'Notícia'));
var art=el('article');
art.appendChild(el('h1','',n.titol||''));
if(n.published_at){var tm=el('time','data',S.dataCurta(n.published_at));tm.setAttribute('datetime',n.published_at);art.appendChild(tm)}
if(n.resum)art.appendChild(el('p','resum',n.resum));
var src=S.urlImatge(cfg,n.imatge);
if(src){var f=el('figure','portada'),i=document.createElement('img');i.src=src;i.alt='';i.onerror=function(){f.remove()};f.appendChild(i);art.appendChild(f)}
var cos=el('div','contingut');cos.appendChild(S.neteja(n.contingut||''));art.appendChild(cos);
main.appendChild(art);
var p=el('p','tornar'),a=el('a','','← Totes les notícies');a.href='/noticies.html';p.appendChild(a);main.appendChild(p);
}).catch(noTrobada);
})();
