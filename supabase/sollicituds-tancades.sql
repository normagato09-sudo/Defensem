-- =====================================================================
-- DEFENSEM · Tanca les sol·licituds d'adhesió d'entitats (octubre 2026)
-- Executa'l sencer a Supabase > SQL Editor > New query > Run.
-- El formulari «La teva entitat vol adherir-s'hi?» s'ha retirat de la web i les entitats
-- només s'afegeixen des de l'app. Aquest SQL:
--   - NO esborra la taula sollicituds_entitats ni cap dada (es conserva per si es recupera),
--   - treu el permís d'inserció a anon i authenticated i la política que ho permetia,
--   - afegeix una política RESTRICTIVA que nega qualsevol inserció des de la web.
-- Admin i editor les continuen podent consultar a Table Editor (lectura i estat, com abans).
-- Es pot executar tantes vegades com calgui. Si la taula no existeix, no fa res.
-- =====================================================================
do $$
begin
  if to_regclass('public.sollicituds_entitats') is null then
    raise notice 'No hi ha la taula sollicituds_entitats: no cal fer res.';
    return;
  end if;
  revoke insert on public.sollicituds_entitats from anon, authenticated;
  drop policy if exists sol_insert on public.sollicituds_entitats;
  drop policy if exists sol_tancades on public.sollicituds_entitats;
  create policy sol_tancades on public.sollicituds_entitats as restrictive for insert to anon, authenticated
    with check (false);
  alter table public.sollicituds_entitats enable row level security;
end $$;
