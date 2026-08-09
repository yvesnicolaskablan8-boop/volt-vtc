-- APPLIQUEE le 2026-08-09 sur le projet pilote (cnwigcbgzzwvvihopvto).
--
-- Role du chauffeur dans la rotation, distinct du type de contrat :
-- un titulaire tient un vehicule, une doublure remplace pendant les repos.
-- Orthogonal a type_contrat (location / salarie) : une doublure peut etre
-- salariee, un titulaire peut etre locataire.
--
-- Nom de colonne verifie : toSnakeCase('roleFlotte') => 'role_flotte'.
-- Voir sql/2026-08-09_jour_repos2.sql pour le piege des noms a chiffre.

ALTER TABLE public.fleet_chauffeurs
  ADD COLUMN IF NOT EXISTS role_flotte text;

ALTER TABLE public.fleet_chauffeurs
  DROP CONSTRAINT IF EXISTS fleet_chauffeurs_role_flotte_check;

ALTER TABLE public.fleet_chauffeurs
  ADD CONSTRAINT fleet_chauffeurs_role_flotte_check
  CHECK (role_flotte IS NULL OR role_flotte IN ('titulaire', 'doublure'));

COMMENT ON COLUMN public.fleet_chauffeurs.role_flotte
  IS 'Role dans la rotation : titulaire (tient un vehicule) ou doublure (remplace). NULL = non defini.';
