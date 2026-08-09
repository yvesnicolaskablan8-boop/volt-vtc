-- APPLIQUEE le 2026-08-09 sur le projet pilote (cnwigcbgzzwvvihopvto).
--
-- Deuxieme jour de repos hebdomadaire pour les chauffeurs salaries.
-- Decision : les salaries ont DEUX jours de repos par semaine.
--
-- ATTENTION AU NOM DE LA COLONNE.
-- La conversion camelCase -> snake_case de l'application est :
--     str.replace(/[A-Z]/g, l => '_' + l.toLowerCase())
-- Elle produit donc jourRepos2 => jour_repos2, et NON jour_repos_2 :
-- le chiffre n'est pas precede d'une majuscule, il ne declenche pas de
-- separateur. Une colonne nommee jour_repos_2 aurait fait echouer TOUT
-- enregistrement de chauffeur en PGRST204 (PostgREST rejette l'insert
-- entier des qu'un champ envoye n'a pas de colonne correspondante).
--
-- Valeurs : 0 = dimanche ... 6 = samedi. NULL = pas de second jour.

ALTER TABLE public.fleet_chauffeurs
  ADD COLUMN IF NOT EXISTS jour_repos2 integer;

ALTER TABLE public.fleet_chauffeurs
  DROP CONSTRAINT IF EXISTS fleet_chauffeurs_jour_repos2_check;

ALTER TABLE public.fleet_chauffeurs
  ADD CONSTRAINT fleet_chauffeurs_jour_repos2_check
  CHECK (jour_repos2 IS NULL OR (jour_repos2 >= 0 AND jour_repos2 <= 6));

COMMENT ON COLUMN public.fleet_chauffeurs.jour_repos2
  IS 'Second jour de repos hebdomadaire (0=dimanche..6=samedi). NULL si un seul jour.';
