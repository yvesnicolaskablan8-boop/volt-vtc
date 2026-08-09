-- APPLIQUEE le 2026-08-09 sur le projet pilote (cnwigcbgzzwvvihopvto).
--
-- CA quotidien par chauffeur, alimente depuis Yango par l'action
-- api/yango.js?action=sync-ca.
--
-- Contexte : l'integration Yango etait entierement EN LECTURE. Rien n'ecrivait
-- jamais dans la base. L'application chauffeur lisait fleet_courses, table que
-- personne ne remplit : la carte « objectif du jour » aurait donc affiche 0 F
-- a des chauffeurs ayant travaille, et le moteur de bonus reposait sur la
-- meme donnee absente.
--
-- Pourquoi une table dediee plutot que fleet_courses : seule la SOMME du jour
-- est lue (objectif, surplus, bonus). Une ligne par course ferait des milliers
-- d'enregistrements pour une information jamais consultee au detail.
--
-- Pourquoi stocker le brut ET la commission : le contrat prevoit que le
-- surplus revient au chauffeur « deduction faite de la commission prelevee
-- par la plateforme ». Sans les deux montants, ce calcul est faux.

CREATE TABLE IF NOT EXISTS public.fleet_ca_jour (
  id                text PRIMARY KEY,          -- CA-<chauffeur_id>-<AAAA-MM-JJ>
  chauffeur_id      text NOT NULL,
  date              date NOT NULL,
  ca_brut           numeric NOT NULL DEFAULT 0,
  commission_yango  numeric NOT NULL DEFAULT 0,
  ca_net            numeric NOT NULL DEFAULT 0,
  nb_courses        integer NOT NULL DEFAULT 0,
  source            text    NOT NULL DEFAULT 'yango',
  maj_le            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chauffeur_id, date)
);

CREATE INDEX IF NOT EXISTS fleet_ca_jour_chauffeur_date ON public.fleet_ca_jour (chauffeur_id, date DESC);
ALTER TABLE public.fleet_ca_jour ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_ca_jour_admin_all ON public.fleet_ca_jour;
CREATE POLICY fleet_ca_jour_admin_all ON public.fleet_ca_jour
  FOR ALL TO authenticated USING (fleet_is_admin()) WITH CHECK (fleet_is_admin());

DROP POLICY IF EXISTS caj_own_select ON public.fleet_ca_jour;
CREATE POLICY caj_own_select ON public.fleet_ca_jour
  FOR SELECT TO authenticated USING (chauffeur_id = fleet_chauffeur_id());
