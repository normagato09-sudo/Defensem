import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Oswald, Barlow_Condensed, Permanent_Marker } from "next/font/google";
import Link from "next/link";
import Instagram from "@/components/Instagram";
import "./globals.css";

const head = Oswald({ subsets: ["latin"], variable: "--f-head" });
const body = Barlow_Condensed({ subsets: ["latin"], variable: "--f-body", weight: ["400", "500", "600", "700"] });
const brush = Permanent_Marker({ subsets: ["latin"], variable: "--f-brush", weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Defensem l’Empordà · Plataforma ciutadana", template: "%s · Defensem l’Empordà" },
  description: "Plataforma ciutadana per protegir el paisatge, la natura i el territori de l’Empordà. Informa’t, signa i participa.",
  openGraph: { type: "website", locale: "ca_ES", siteName: "Defensem l’Empordà" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ca" className={`${head.variable} ${body.variable} ${brush.variable}`}>
      <body>
        <a className="skip" href="#main">Salta al contingut</a>
        <header className="bar"><div className="row">
          <Link href="/" className="brand">Defensem l’Empordà</Link>
          <nav aria-label="Principal">
            <div className="dd"><Link href="/la-causa">La causa</Link>
              <ul><li><Link href="/la-causa">Què ens preocupa</Link></li><li><Link href="/preguntes">Preguntes freqüents</Link></li></ul></div>
            <Link href="/noticies">Notícies</Link>
            <div className="dd"><Link href="/uneix-te">Acció</Link>
              <ul><li><Link href="/uneix-te">Signa i participa</Link></li><li><Link href="/contacte">Contacte</Link></li></ul></div>
            <Instagram className="ig" label="" />
          </nav>
        </div></header>
        <main id="main">{children}</main>
        <footer><div className="wrap"><Link href="/privacitat">Privacitat</Link> · <Link href="/contacte">Contacte</Link> · <Instagram className="ig" /> · Defensem l’Empordà</div></footer>
      </body>
    </html>
  );
}
