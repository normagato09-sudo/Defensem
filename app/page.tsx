import Link from "next/link";
import Hero from "@/components/Hero";
import Instagram from "@/components/Instagram";

const cards: [string, string][] = [
  ["Informem sobre el projecte", "/la-causa"],
  ["Responem els dubtes", "/preguntes"],
  ["Recollim suports", "/uneix-te"],
  ["Ens organitzem amb voluntariat", "/uneix-te"],
  ["Seguim l’actualitat", "/noticies"],
  ["Escolta’ns i escriu-nos", "/contacte"],
];

export default function Home() {
  return (
    <>
      <section className="hero"><div className="wrap">
        <Hero />
        <h1><span className="brush big">NO</span>al parc eòlic!</h1>
        <p className="brush sub">Defensem l’Empordà</p>
        <Link className="btn" href="/uneix-te">Signa i participa</Link>
        <Instagram className="btn ig" label="Segueix-nos" />
      </div></section>

      <section className="s"><div className="wrap">
        <h2>Què <em>fem</em>?</h2>
        <div className="cards">{cards.map(([t, h], i) => <Link key={i} className="cardl" href={h}><span>{t}</span></Link>)}</div>
      </div></section>

      <section className="facts"><div className="wrap">
        <h2>El projecte que ens preocupa</h2>
        <dl>
          <div><dt>On? </dt><dd>Entre els pobles de la Tallada, Tor, Bellcaire, Albons, Ullà i Verges.</dd></div>
          <div><dt>Qui ho farà? </dt><dd>Una empresa estrangera.</dd></div>
          <div><dt>A on anirà l’energia? </dt><dd>A la xarxa de distribució, no al consum local.</dd></div>
          <div><dt>Què defensem? </dt><dd>La nostra terra, natura, conreu, salut i economia.</dd></div>
        </dl>
        <p className="lema">Un parc eòlic avui, un paisatge perdut per sempre</p>
        <p className="note"><span className="prov">Dades del fullet de la plataforma Defensem l’Empordanet</span> Cal confirmar-les i afegir-hi fonts abans de publicar.</p>
      </div></section>

      <section className="s"><div className="wrap">
        <h2>Últimes <em>notícies</em></h2>
        <p>Encara no hi ha notícies publicades.</p>
        <Link className="btn" href="/noticies">Veure notícies</Link>
      </div></section>

      <section className="cta"><div className="wrap">
        <h2>Signa i <em>fes-ho teu</em></h2>
        <Link className="btn" href="/uneix-te">Signa i participa</Link>
        <Instagram className="btn alt ig" label="Instagram" />
      </div></section>
    </>
  );
}
