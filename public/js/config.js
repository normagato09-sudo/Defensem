/* Configuració del web.
   instagram: adreça completa del perfil oficial, p. ex. "https://www.instagram.com/NOM_D_USUARI/".
   Mentre estigui buida, la icona d'Instagram no es mostra enlloc.

   supabaseUrl i supabaseAnonKey: Supabase > Project Settings > API ("Project URL" i la clau "anon public").
   La clau "anon" és pública per disseny: la seguretat la fan les polítiques RLS de la base de dades.
   MAI no posis aquí la clau "service_role" (ni cap altra clau secreta): només va a Vercel com a variable d'entorn.
   Mentre estiguin buides, les notícies es llegeixen de /noticies.json i l'àrea privada no està disponible. */
window.DEFENSEM = {
  instagram: "",
  supabaseUrl: "https://uzkwfudbrozjzjtcjfry.supabase.co",
  supabaseAnonKey: "sb_publishable_YolBmLZfPv1BiL9F2Ecz7w_5aVcbtFw"
};
