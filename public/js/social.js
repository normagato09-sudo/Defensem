(function(){
var u=((window.DEFENSEM&&window.DEFENSEM.instagram)||'').trim();
if(!/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._\/?=&-]+$/.test(u))return;
var NS='http://www.w3.org/2000/svg';
function node(n,at){var e=document.createElementNS(NS,n);for(var k in at)e.setAttribute(k,at[k]);return e}
function enllac(){
var a=document.createElement('a');a.className='ig';a.href=u;a.target='_blank';a.rel='noopener noreferrer';
a.setAttribute('aria-label','Segueix-nos a Instagram (s’obre en una pestanya nova)');
var s=node('svg',{viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false'});
s.appendChild(node('rect',{x:'3',y:'3',width:'18',height:'18',rx:'5'}));
s.appendChild(node('circle',{cx:'12',cy:'12',r:'4.2'}));
s.appendChild(node('circle',{cx:'17.4',cy:'6.6',r:'1.1',fill:'currentColor',stroke:'none'}));
var t=document.createElement('span');t.textContent='Segueix-nos a Instagram';
a.appendChild(s);a.appendChild(t);return a}
var c=document.getElementById('ig-contacte');if(c){c.hidden=false;c.appendChild(enllac())}
var f=document.getElementById('ig-peu');if(f)f.appendChild(enllac());
})();
