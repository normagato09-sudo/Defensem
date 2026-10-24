// Comprova les adreces de public/js/eines.js (també les que estan en comentari «PENDENT DE VERIFICAR»).
// Ús: node proves/verifica-eines.mjs   (Node 18 o posterior, amb accés a internet)
// Per a cada URL diu si respon (codi HTTP final) i si el web permet incrustar-lo en un iframe («Veure aquí»).
import { readFile } from 'node:fs/promises';

const codi = await readFile(new URL('../public/js/eines.js', import.meta.url), 'utf8');
const urls = [...new Set([...codi.matchAll(/url:\s*'(https:\/\/[^']+)'/g)].map((m) => m[1]).filter((u) => !u.includes('…')))];
let errors = 0;
for (const url of urls) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (verificacio Defensem)' } });
    const xfo = r.headers.get('x-frame-options') || '';
    const fa = (r.headers.get('content-security-policy') || '').match(/frame-ancestors[^;]*/i)?.[0] || '';
    const incrustable = !xfo && (!fa || /frame-ancestors\s+\*/.test(fa));
    if (!r.ok) errors++;
    console.log(`${r.ok ? 'OK ' : 'KO '} ${r.status}  incrustable: ${incrustable ? 'sí' : 'no'}${xfo ? ' (X-Frame-Options: ' + xfo + ')' : ''}${fa ? ' (' + fa + ')' : ''}\n     ${url}${r.url !== url ? '\n     → ' + r.url : ''}`);
  } catch (e) {
    errors++;
    console.log(`KO  ${e.cause?.code || e.name}  ${url}`);
  }
}
console.log(`\n${urls.length - errors} de ${urls.length} adreces responen.`);
