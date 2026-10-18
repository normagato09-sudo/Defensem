import type { Metadata } from "next";
import Instagram from "@/components/Instagram";

export const metadata: Metadata = { title: "Notícies", description: "Notícies, comunicats i actualitat de la plataforma." };

export default function News() {
  return (
    <div className="page"><div className="wrap">
      <h1>Notícies</h1>
      <div className="empty">
        <p><strong>Encara no hi ha notícies publicades.</strong> Quan n’hi hagi, apareixeran aquí.</p>
        <Instagram className="btn ig" label="Segueix-nos a Instagram" />
      </div>
    </div></div>
  );
}
