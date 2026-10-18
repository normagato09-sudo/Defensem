import type { Metadata } from "next";

export const metadata: Metadata = { title: "La causa", description: "Què preocupa a la plataforma i què proposa." };

const topics: [string, string][] = [
  ["Un model energètic amb seny", "No es rebutgen les renovables: es defensa una transició local, distribuïda i no especulativa. La plataforma denuncia que el projecte preveu quatre aerogeneradors de 200 metres d’alçada, amb aspes de 80 metres, al pla de la Tallada d’Empordà."],
  ["Energia per a la gent, no per a especuladors", "La promotora indicada és Eòlica Anoia S.L., del grup RWE. La plataforma critica que el benefici sigui privat i no local."],
  ["Demanda elèctrica", "Afirma que la demanda es manté continguda des del 2023 i que l’energia s’exportaria a xarxes majors, sense cobrir necessitats locals."],
  ["Impacte ambiental", "Alerta d’afectació a una zona de pas d’aus i d’alimentació d’espècies protegides, a camps agraris, a les capes freàtiques (fonaments d’uns 30 metres sense estudi conegut) i d’efectes d’ombra i il·luminació nocturna."],
  ["Soroll", "Cita el mapa sonor de la promotora, amb entre 40 i 45 dB en alguns masos i més de 30 dB als nuclis de la Tallada, Tor i Bellcaire, i els compara amb la recomanació de l’OMS per a zones residencials."],
  ["Economia i turisme", "Assegura que els habitatges de la zona es podrien devaluar entre un 5% i un 40% i que el turisme podria resultar afectat."],
  ["Paisatge", "El Catàleg de Paisatge protegeix el Massís del Montgrí com a fons escènic emblemàtic. La plataforma considera que els aerogeneradors en degradarien el valor."],
  ["Què proposa", "Reduir el consum, augmentar l’eficiència i prioritzar instal·lacions en espais ja alterats (cobertes, polígons, terrenys degradats), d’acord amb el Decret llei 16/2019."],
];

export default function Cause() {
  return (
    <div className="page"><div className="wrap">
      <h1>La causa</h1>
      <p className="note">Aquestes afirmacions provenen del fullet de la plataforma Defensem l’Empordanet. Abans de publicar-les cal afegir la font de cada dada i separar els fets documentats de les opinions.</p>
      <div className="topics">
        {topics.map(([t, p]) => (
          <article className="topic" key={t}><h2>{t}</h2><p>{p}</p><span className="prov">Font pendent de verificar</span></article>
        ))}
      </div>
    </div></div>
  );
}
