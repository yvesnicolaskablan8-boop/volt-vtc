-- APPLIQUEE le 2026-08-11 : retrait de la logique de zones de recharge.
-- Volt n'a aucun lieu de recharge fixe ; aucune zone n'a jamais ete declaree.
-- La detection AUTOMATIQUE reste assuree par la signature de tension (montee
-- du 12 V au branchement) et par les ancres d'arret prolonge, valables
-- partout. Les colonnes charge_zone_entree_le / charge_zone_id sont
-- CONSERVEES : elles portent l'etat du detecteur de tension.
ALTER TABLE public.fleet_settings DROP COLUMN IF EXISTS zones_recharge;
