import type { Metadata } from "next";
import LeadForm from "@/components/LeadForm";
import Instagram from "@/components/Instagram";

export const metadata: Metadata = { title: "Contacte", description: "Escriu-nos si ets veí, entitat o associació." };

export default function Contact() {
  return (
    <div className="page"><div className="wrap">
      <h1>Contacte</h1>
      <p>Veïns, associacions i entitats: escriviu-nos.</p>
      <LeadForm kind="contact" cta="Envia" withMessage />
      <p style={{ marginTop: "1.5rem" }}><Instagram className="ig" label="També ens trobaràs a Instagram" /></p>
    </div></div>
  );
}
