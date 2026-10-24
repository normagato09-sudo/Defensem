/* Configuració del web.
   instagram: adreça completa del perfil oficial, p. ex. "https://www.instagram.com/NOM_D_USUARI/".
   Mentre estigui buida, la icona d'Instagram no es mostra enlloc.

   supabaseUrl i supabaseAnonKey: Supabase > Project Settings > API ("Project URL" i la clau "anon public").
   La clau "anon" és pública per disseny: la seguretat la fan les polítiques RLS de la base de dades.
   MAI no posis aquí la clau "service_role" (ni cap altra clau secreta): només va a Vercel com a variable d'entorn.
   Mentre estiguin buides, les notícies es llegeixen de /noticies.json i l'àrea privada no està disponible.

   imatgesReduides: posa-ho a true només si el projecte de Supabase té les transformacions d'imatge actives (plans
   de pagament); llavors les targetes de notícies demanen una versió reduïda de 640 px de cada imatge. */
window.DEFENSEM = {
  instagram: "https://www.instagram.com/defensemlempordanet/",
  supabaseUrl: "https://uzkwfudbrozjzjtcjfry.supabase.co",
  supabaseAnonKey: "sb_publishable_YolBmLZfPv1BiL9F2Ecz7w_5aVcbtFw"
};
