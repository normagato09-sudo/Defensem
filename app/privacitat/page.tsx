import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacitat" };

export default function Privacy() {
  return (
    <div className="page"><div className="wrap">
      <h1>Política de privacitat</h1>
      <p><span className="prov">Esborrany: revisar amb una persona jurista abans de publicar.</span></p>
      <p><strong>Responsable:</strong> <span className="prov">nom, NIF, adreça i correu</span>.</p>
      <p><strong>Finalitat:</strong> comptar el suport a la iniciativa, gestionar el voluntariat i respondre missatges.</p>
      <p><strong>Base jurídica:</strong> el teu consentiment (art. 6.1.a RGPD), que pots retirar en qualsevol moment.</p>
      <p><strong>Conservació:</strong> <span className="prov">termini</span> o fins que en demanis la supressió.</p>
      <p><strong>Destinataris:</strong> no cedim les dades; el proveïdor d’allotjament i de base de dades actua com a encarregat del tractament.</p>
      <p><strong>Drets:</strong> accés, rectificació, supressió, oposició, limitació i portabilitat, escrivint al correu del responsable. Pots reclamar davant l’AEPD o l’APDCAT.</p>
      <p><strong>Edat:</strong> cal tenir 14 anys o més.</p>
    </div></div>
  );
}
