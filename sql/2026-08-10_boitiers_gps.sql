-- APPLIQUEE le 2026-08-10 sur le projet pilote (cnwigcbgzzwvvihopvto).
-- Boitiers GPS WhatsGPS poses sur les vehicules.
ALTER TABLE public.fleet_vehicules
  ADD COLUMN IF NOT EXISTS gps_car_id text,
  ADD COLUMN IF NOT EXISTS gps_imei   text,
  ADD COLUMN IF NOT EXISTS gps_position jsonb,
  ADD COLUMN IF NOT EXISTS gps_maj_le timestamptz;
CREATE INDEX IF NOT EXISTS fleet_vehicules_gps_car ON public.fleet_vehicules (gps_car_id);

-- 2026-08-10, second volet : estimation d'autonomie.
-- Le boitier ne lit pas la batterie de traction ; on estime :
--   restant = autonomie_reelle_km - km depuis la derniere charge (distanceSta).
ALTER TABLE public.fleet_vehicules
  ADD COLUMN IF NOT EXISTS derniere_charge_le  timestamptz,
  ADD COLUMN IF NOT EXISTS autonomie_reelle_km numeric DEFAULT 250,
  ADD COLUMN IF NOT EXISTS km_depuis_charge    numeric;
