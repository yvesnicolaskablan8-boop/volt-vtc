-- Deuxieme jour de repos hebdomadaire pour les chauffeurs salaries.
-- Decision du 2026-08-09 : les salaries ont DEUX jours de repos par semaine.
--
-- Sans cette colonne, le champ « 2e jour de repos » de la fiche chauffeur
-- ferait echouer TOUT enregistrement de chauffeur (PGRST204 : PostgREST
-- rejette l'insert entier des qu'un champ envoye n'a pas de colonne).
-- C'est pourquoi le champ a ete retire du deploiement v425 et doit etre
-- remis UNIQUEMENT apres cette migration.
--
-- Valeurs : 0 = dimanche ... 6 = samedi. NULL = pas de second jour de repos.

ALTER TABLE public.fleet_chauffeurs
  ADD COLUMN IF NOT EXISTS jour_repos_2 integer;

ALTER TABLE public.fleet_chauffeurs
  DROP CONSTRAINT IF EXISTS fleet_chauffeurs_jour_repos_2_check;

ALTER TABLE public.fleet_chauffeurs
  ADD CONSTRAINT fleet_chauffeurs_jour_repos_2_check
  CHECK (jour_repos_2 IS NULL OR (jour_repos_2 >= 0 AND jour_repos_2 <= 6));

COMMENT ON COLUMN public.fleet_chauffeurs.jour_repos_2
  IS 'Second jour de repos hebdomadaire (0=dimanche..6=samedi). NULL si un seul jour.';
