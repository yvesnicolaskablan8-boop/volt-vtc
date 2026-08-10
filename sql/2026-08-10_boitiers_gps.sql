-- APPLIQUEE le 2026-08-10 sur le projet pilote (cnwigcbgzzwvvihopvto).
-- Boitiers GPS WhatsGPS poses sur les vehicules.
ALTER TABLE public.fleet_vehicules
  ADD COLUMN IF NOT EXISTS gps_car_id text,
  ADD COLUMN IF NOT EXISTS gps_imei   text,
  ADD COLUMN IF NOT EXISTS gps_position jsonb,
  ADD COLUMN IF NOT EXISTS gps_maj_le timestamptz;
CREATE INDEX IF NOT EXISTS fleet_vehicules_gps_car ON public.fleet_vehicules (gps_car_id);
