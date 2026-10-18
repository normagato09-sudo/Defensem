import type { Metadata } from "next";
import LeadForm from "@/components/LeadForm";

export const metadata: Metadata = { title: "Uneix-te", description: "Mostra el teu suport o ofereix-te com a voluntari." };

export default function Join() {
  return (
    <div className="page"><div className="wrap">
      <h1>Uneix-te a la iniciativa</h1>
      <p>El teu nom no es publica mai sense el teu consentiment explícit.</p>
      <div className="cols">
        <div><h2>Dono suport</h2><LeadForm kind="support" cta="Signa" /></div>
        <div><h2>Vull ser voluntari</h2><LeadForm kind="volunteer" cta="M’apunto" withMessage /></div>
      </div>
    </div></div>
  );
}
