-- APPLIQUEE le 2026-08-09 sur le projet pilote (cnwigcbgzzwvvihopvto).
--
-- La section « Contrat » de l'application chauffeur restait vide : le modele
-- vit dans fleet_settings, table que les regles RLS interdisent au chauffeur.
-- La requete renvoyait un tableau vide, sans erreur — donc un ecran vide sans
-- explication.
--
-- Ouvrir fleet_settings aux chauffeurs aurait ete la mauvaise reponse : la
-- colonne « integrations » contient les identifiants de l'API Yango. Ce RPC
-- n'expose que le contrat et les mentions d'entreprise qui figurent deja sur
-- le document signe.

CREATE OR REPLACE FUNCTION public.fleet_contrat_modele()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'contrat', coalesce(contrat, '{}'::jsonb),
    'entreprise', jsonb_build_object(
      'nom',            entreprise->>'nom',
      'adresse',        entreprise->>'adresse',
      'telephone',      entreprise->>'telephone',
      'email',          entreprise->>'email',
      'numeroRegistre', entreprise->>'numeroRegistre'
    )
  )
  FROM public.fleet_settings
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fleet_contrat_modele() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fleet_contrat_modele() TO authenticated;
