import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Preguntes freqüents", description: "Respostes a les preguntes més habituals sobre la causa." };

const qa: [string, string, boolean][] = [
  ["Esteu en contra de les energies renovables?", "No. La plataforma defensa una transició ecològica local, distribuïda i no especulativa, i instal·lacions en espais ja alterats com cobertes, polígons o terrenys degradats.", true],
  ["Quin projecte us preocupa?", "Quatre aerogeneradors de 200 metres d’alçada al pla de la Tallada d’Empordà, entre els pobles de la Tallada, Tor, Bellcaire, Albons, Ullà i Verges.", true],
  ["Qui és la promotora?", "Segons la plataforma, Eòlica Anoia S.L., que forma part del grup RWE.", true],
  ["Què podria canviar al paisatge?", "La plataforma recorda que el Catàleg de Paisatge protegeix el Massís del Montgrí i considera que els aerogeneradors en degradarien el valor.", true],
  ["Com puc participar?", "Pots signar, oferir-te com a voluntari o escriure’ns. Totes les accions que proposem són pacífiques i legals.", false],
];

export default function Faq() {
  return (
    <div className="page"><div className="wrap">
      <h1>Preguntes freqüents</h1>
      <p className="note">Respostes basades en el fullet de la plataforma. Cal afegir-hi les fonts abans de publicar.</p>
      {qa.map(([q, a, pending]) => (
        <details key={q}><summary>{q}</summary><p>{a}</p>{pending && <span className="prov">Font pendent de verificar</span>}</details>
      ))}
      <p style={{ marginTop: "1.5rem" }}><Link className="btn" href="/uneix-te">Signa i participa</Link></p>
    </div></div>
  );
}
