"use client";
import { useState, type FormEvent } from "react";

type Kind = "support" | "volunteer" | "contact";

export default function LeadForm({ kind, cta, withMessage = false }: { kind: Kind; cta: string; withMessage?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [err, setErr] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setState("sending");
    try {
      const r = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, name: fd.get("name"), email: fd.get("email"),
          municipality: fd.get("municipality") || undefined, message: fd.get("message") || undefined,
          consent: fd.get("consent") === "on", website: fd.get("website") || "",
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "No s’ha pogut enviar."); setState("error"); return;
      }
      form.reset(); setState("ok");
    } catch { setErr("Sense connexió. Torna-ho a provar."); setState("error"); }
  }

  const id = (n: string) => `${kind}-${n}`;
  return (
    <form className="card" onSubmit={onSubmit}>
      <label htmlFor={id("name")}>Nom i cognoms</label>
      <input id={id("name")} name="name" required minLength={2} autoComplete="name" />
      <label htmlFor={id("email")}>Correu electrònic</label>
      <input id={id("email")} name="email" type="email" required autoComplete="email" />
      <label htmlFor={id("mun")}>Municipi (opcional)</label>
      <input id={id("mun")} name="municipality" autoComplete="address-level2" />
      {withMessage && (<><label htmlFor={id("msg")}>Missatge</label><textarea id={id("msg")} name="message" rows={4} required minLength={5} /></>)}
      <div className="hp" aria-hidden="true"><label>No omplir<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="check"><input id={id("c")} name="consent" type="checkbox" required />
        <label htmlFor={id("c")}>He llegit i accepto la <a href="/privacitat">política de privacitat</a>.</label></p>
      <button className="btn" type="submit" disabled={state === "sending"}>{state === "sending" ? "Enviant…" : cta}</button>
      {state === "ok" && <p className="msg ok" role="status">Rebut, gràcies!</p>}
      {state === "error" && <p className="msg bad" role="alert">{err}</p>}
    </form>
  );
}
