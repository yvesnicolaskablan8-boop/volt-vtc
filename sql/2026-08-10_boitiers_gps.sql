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

-- Troisieme volet : le chauffeur marque sa recharge depuis son application.
-- RPC fleet_marquer_charge (SECURITY DEFINER) : uniquement SON vehicule
-- assigne, avec tracabilite (charge_marquee_par).
ALTER TABLE public.fleet_vehicules
  ADD COLUMN IF NOT EXISTS charge_marquee_par text;

-- Quatrieme volet : detection AUTOMATIQUE des recharges.
--  - par zone declaree (depot, borne) : immobile >= dureeMin dans le rayon ;
--  - par signature de tension, valable partout : moteur eteint + immobile +
--    tension 12 V qui MONTE d'au moins 0,4 V (le convertisseur s'active au
--    branchement). La montee est exigee, pas un niveau absolu : certains
--    vehicules flottent a 13 V a l'arret.
ALTER TABLE public.fleet_settings  ADD COLUMN IF NOT EXISTS zones_recharge jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.fleet_vehicules ADD COLUMN IF NOT EXISTS charge_zone_entree_le timestamptz,
                                   ADD COLUMN IF NOT EXISTS charge_zone_id text;
