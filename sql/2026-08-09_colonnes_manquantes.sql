-- APPLIQUEE le 2026-08-09 sur le projet pilote (cnwigcbgzzwvvihopvto).
--
-- Cinq champs du formulaire chauffeur n'avaient aucune colonne. PostgREST
-- rejette l'enregistrement ENTIER des qu'un seul champ est inconnu (PGRST204),
-- d'ou « Erreur de synchronisation avec le serveur » apres chaque modification.
--
-- LE PIEGE DES ACRONYMES. La conversion camelCase -> snake_case insere un
-- separateur devant CHAQUE majuscule :
--     objectifCA        => objectif_c_a      (et non objectif_ca)
--     dateExpirationVTC => date_expiration_v_t_c
-- C'est le meme mecanisme que le piege des chiffres (jourRepos2 => jour_repos2).
-- Les colonnes sont donc creees sous ces noms exacts, pour que la regle reste
-- unique : le nom de colonne est TOUJOURS le resultat de la conversion.

ALTER TABLE public.fleet_chauffeurs
  ADD COLUMN IF NOT EXISTS date_expiration_permis  date,
  ADD COLUMN IF NOT EXISTS date_expiration_visite  date,
  ADD COLUMN IF NOT EXISTS date_expiration_v_t_c   date,
  ADD COLUMN IF NOT EXISTS objectif_c_a            numeric,
  ADD COLUMN IF NOT EXISTS parc_id                 text;

ALTER TABLE public.fleet_vehicules
  ADD COLUMN IF NOT EXISTS parc_id text;

CREATE INDEX IF NOT EXISTS fleet_chauffeurs_parc ON public.fleet_chauffeurs (parc_id);
CREATE INDEX IF NOT EXISTS fleet_vehicules_parc  ON public.fleet_vehicules  (parc_id);
