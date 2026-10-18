import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["support", "volunteer", "contact"]),
  name: z.string().trim().min(2, "Escriu el teu nom.").max(120),
  email: z.string().trim().email("El correu no és vàlid.").max(200),
  municipality: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Cal acceptar la política de privacitat." }) }),
});

// Límit bàsic per IP (millor esforç; en serverless cal un límit extern per a més garanties).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Massa intents. Torna-ho a provar més tard." }, { status: 429 });

  let raw: Record<string, unknown>;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Dades no vàlides." }, { status: 400 }); }

  if (typeof raw.website === "string" && raw.website !== "") return NextResponse.json({ ok: true }); // trampa anti-spam

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  if (d.kind === "contact" && (d.message?.length ?? 0) < 5) return NextResponse.json({ error: "Escriu un missatge." }, { status: 400 });

  try {
    const { error } = await getAdmin().from("leads").insert({
      kind: d.kind, name: d.name, email: d.email, municipality: d.municipality || null, message: d.message || null, consent: true,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "not-configured")
      return NextResponse.json({ error: "El servei encara no està configurat." }, { status: 503 });
    console.error("lead insert failed");
    return NextResponse.json({ error: "No s’ha pogut desar. Torna-ho a provar." }, { status: 500 });
  }
}
