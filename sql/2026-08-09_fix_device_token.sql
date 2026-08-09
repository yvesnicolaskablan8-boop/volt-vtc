-- APPLIQUEE le 2026-08-09 sur le projet pilote (cnwigcbgzzwvvihopvto).
--
-- fleet_issue_device_token appelait gen_random_bytes(), fourni par pgcrypto
-- dans le schema « extensions », alors que la fonction fixe
-- SET search_path TO 'public'. Elle echouait donc SYSTEMATIQUEMENT en 42883
-- (« function gen_random_bytes(integer) does not exist ») : aucun jeton
-- d'appareil ne pouvait etre delivre, et le suivi GPS natif etait
-- inutilisable des la premiere installation — sans que rien ne le signale.
--
-- gen_random_uuid() vit dans pg_catalog depuis PostgreSQL 13 : il est resolu
-- quel que soit le search_path. Deux UUID concatenes donnent 64 caracteres
-- hexadecimaux, soit une entropie tres suffisante pour un jeton d'appareil.

CREATE OR REPLACE FUNCTION public.fleet_issue_device_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ch text; v_tok text;
BEGIN
  SELECT id INTO v_ch FROM fleet_chauffeurs WHERE auth_id = auth.uid() LIMIT 1;
  IF v_ch IS NULL THEN RAISE EXCEPTION 'Aucun profil chauffeur pour cet utilisateur'; END IF;
  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO fleet_device_tokens (token, chauffeur_id) VALUES (v_tok, v_ch);
  RETURN v_tok;
END $function$;
