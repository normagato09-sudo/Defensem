# Defensem l’Empordà

Next.js 14 (App Router) + Supabase. Desplegament a Vercel.

## Posada en marxa
1. Crea un projecte a supabase.com i executa `supabase/schema.sql` al SQL Editor.
2. Copia `.env.example` a `.env.local` i omple `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` (Project Settings > API). **Aquesta clau és secreta: mai al navegador ni a GitHub.**
3. `npm install` i `npm run dev`.
4. A Vercel, afegeix les mateixes 3 variables a Settings > Environment Variables.

Sense les variables, els formularis responen "El servei encara no està configurat" (no simulen que funcionen).

Les dades arriben a la taula `leads` (Table Editor de Supabase).
