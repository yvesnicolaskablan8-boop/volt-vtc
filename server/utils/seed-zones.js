/**
 * SeedZones — 113 radars fixes et pedagogiques d'Abidjan
 *
 * Donnees basees sur les emplacements reels des radars de la ville.
 * Appele au demarrage du serveur. Remplace automatiquement les anciennes
 * zones generiques (<=12) par les positions precises.
 */

const ZoneVitesse = require('../models/ZoneVitesse');

// ---------------------------------------------------------------------------
// Donnees radar — 113 positions groupees par axe
// ---------------------------------------------------------------------------

const RADARS_ABIDJAN = [
  // -----------------------------------------------------------------------
  // Boulevard de la Paix Plateau (Carena) — 60 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_001', name: 'Radar Paix-01', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31650, lng: -4.01950, status: 'active', desc: 'Radar fixe a l\'entree du boulevard cote Est' },
  { id: 'radar_002', name: 'Radar Paix-02', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31700, lng: -4.02100, status: 'active', desc: 'Radar fixe direction Carena' },
  { id: 'radar_003', name: 'Radar Paix-03', type: 'pedagogical', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31750, lng: -4.02250, status: 'active', desc: 'Radar pedagogique avant rond-point' },
  { id: 'radar_004', name: 'Radar Paix-04', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31800, lng: -4.02400, status: 'active', desc: 'Radar fixe zone Carena' },
  { id: 'radar_005', name: 'Radar Paix-05', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31680, lng: -4.02020, status: 'active', desc: 'Radar fixe direction Plateau' },
  { id: 'radar_006', name: 'Radar Paix-06', type: 'pedagogical', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31720, lng: -4.02170, status: 'active', desc: 'Radar pedagogique milieu boulevard' },
  { id: 'radar_007', name: 'Radar Paix-07', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31630, lng: -4.01880, status: 'active', desc: 'Radar fixe entree sud boulevard de la Paix' },
  { id: 'radar_008', name: 'Radar Paix-08', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31780, lng: -4.02330, status: 'active', desc: 'Radar fixe approche Carena' },
  { id: 'radar_009', name: 'Radar Paix-09', type: 'pedagogical', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31850, lng: -4.02500, status: 'active', desc: 'Radar pedagogique sortie boulevard' },
  { id: 'radar_010', name: 'Radar Paix-10', type: 'fixed', axis: 'Boulevard de la Paix Plateau (Carena)', lat: 5.31600, lng: -4.01800, status: 'active', desc: 'Radar fixe debut boulevard de la Paix' },

  // -----------------------------------------------------------------------
  // Boulevard de France — 60 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_011', name: 'Radar France-01', type: 'fixed', axis: 'Boulevard de France', lat: 5.31550, lng: -4.01600, status: 'active', desc: 'Radar fixe entree boulevard de France' },
  { id: 'radar_012', name: 'Radar France-02', type: 'fixed', axis: 'Boulevard de France', lat: 5.31500, lng: -4.01450, status: 'active', desc: 'Radar fixe direction port' },
  { id: 'radar_013', name: 'Radar France-03', type: 'pedagogical', axis: 'Boulevard de France', lat: 5.31450, lng: -4.01300, status: 'active', desc: 'Radar pedagogique zone ecole' },
  { id: 'radar_014', name: 'Radar France-04', type: 'fixed', axis: 'Boulevard de France', lat: 5.31400, lng: -4.01150, status: 'active', desc: 'Radar fixe centre boulevard' },
  { id: 'radar_015', name: 'Radar France-05', type: 'fixed', axis: 'Boulevard de France', lat: 5.31350, lng: -4.01000, status: 'active', desc: 'Radar fixe vers Treichville' },
  { id: 'radar_016', name: 'Radar France-06', type: 'pedagogical', axis: 'Boulevard de France', lat: 5.31300, lng: -4.00850, status: 'active', desc: 'Radar pedagogique avant intersection' },
  { id: 'radar_017', name: 'Radar France-07', type: 'fixed', axis: 'Boulevard de France', lat: 5.31250, lng: -4.00700, status: 'active', desc: 'Radar fixe zone commerciale' },
  { id: 'radar_018', name: 'Radar France-08', type: 'fixed', axis: 'Boulevard de France', lat: 5.31200, lng: -4.00550, status: 'active', desc: 'Radar fixe direction gare lagunaire' },
  { id: 'radar_019', name: 'Radar France-09', type: 'fixed', axis: 'Boulevard de France', lat: 5.31150, lng: -4.00400, status: 'active', desc: 'Radar fixe sortie boulevard de France' },
  { id: 'radar_020', name: 'Radar France-10', type: 'pedagogical', axis: 'Boulevard de France', lat: 5.31100, lng: -4.00250, status: 'active', desc: 'Radar pedagogique fin de boulevard' },

  // -----------------------------------------------------------------------
  // Boulevard C2 Cocody-Plateau — 60 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_021', name: 'Radar C2-01', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.33200, lng: -3.99500, status: 'active', desc: 'Radar fixe entree C2 cote Cocody' },
  { id: 'radar_022', name: 'Radar C2-02', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.33050, lng: -3.99700, status: 'active', desc: 'Radar fixe direction Plateau' },
  { id: 'radar_023', name: 'Radar C2-03', type: 'pedagogical', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32900, lng: -3.99900, status: 'active', desc: 'Radar pedagogique zone universitaire' },
  { id: 'radar_024', name: 'Radar C2-04', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32750, lng: -4.00100, status: 'active', desc: 'Radar fixe centre C2' },
  { id: 'radar_025', name: 'Radar C2-05', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32600, lng: -4.00300, status: 'active', desc: 'Radar fixe vers echangeur' },
  { id: 'radar_026', name: 'Radar C2-06', type: 'pedagogical', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32450, lng: -4.00500, status: 'active', desc: 'Radar pedagogique avant pont' },
  { id: 'radar_027', name: 'Radar C2-07', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32300, lng: -4.00700, status: 'active', desc: 'Radar fixe approche Plateau' },
  { id: 'radar_028', name: 'Radar C2-08', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32150, lng: -4.00900, status: 'active', desc: 'Radar fixe zone administrative' },
  { id: 'radar_029', name: 'Radar C2-09', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.32000, lng: -4.01100, status: 'active', desc: 'Radar fixe entree Plateau par C2' },
  { id: 'radar_030', name: 'Radar C2-10', type: 'pedagogical', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.33350, lng: -3.99300, status: 'active', desc: 'Radar pedagogique sortie Cocody' },
  { id: 'radar_031', name: 'Radar C2-11', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.33500, lng: -3.99100, status: 'active', desc: 'Radar fixe Riviera direction C2' },
  { id: 'radar_032', name: 'Radar C2-12', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.33650, lng: -3.98900, status: 'active', desc: 'Radar fixe carrefour Riviera' },
  { id: 'radar_033', name: 'Radar C2-13', type: 'fixed', axis: 'Boulevard C2 Cocody-Plateau', lat: 5.31850, lng: -4.01300, status: 'active', desc: 'Radar fixe terminus C2 Plateau' },

  // -----------------------------------------------------------------------
  // Boulevard Valery Giscard d'Estaing (VGE) — 80 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_034', name: 'Radar VGE-01', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.33800, lng: -4.01200, status: 'active', desc: 'Radar fixe entree VGE nord' },
  { id: 'radar_035', name: 'Radar VGE-02', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.33600, lng: -4.01400, status: 'active', desc: 'Radar fixe VGE direction Plateau' },
  { id: 'radar_036', name: 'Radar VGE-03', type: 'pedagogical', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.33400, lng: -4.01600, status: 'active', desc: 'Radar pedagogique VGE zone Cocody' },
  { id: 'radar_037', name: 'Radar VGE-04', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.33200, lng: -4.01800, status: 'active', desc: 'Radar fixe VGE centre' },
  { id: 'radar_038', name: 'Radar VGE-05', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.33000, lng: -4.02000, status: 'active', desc: 'Radar fixe VGE vers echangeur Riviera' },
  { id: 'radar_039', name: 'Radar VGE-06', type: 'mobile', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.32800, lng: -4.02200, status: 'active', desc: 'Zone de controle mobile VGE' },
  { id: 'radar_040', name: 'Radar VGE-07', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.32600, lng: -4.02400, status: 'active', desc: 'Radar fixe VGE approche Marcory' },
  { id: 'radar_041', name: 'Radar VGE-08', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.32400, lng: -4.02600, status: 'active', desc: 'Radar fixe VGE zone Marcory' },
  { id: 'radar_042', name: 'Radar VGE-09', type: 'pedagogical', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.32200, lng: -4.02800, status: 'active', desc: 'Radar pedagogique VGE sud' },
  { id: 'radar_043', name: 'Radar VGE-10', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.32000, lng: -4.03000, status: 'active', desc: 'Radar fixe VGE sortie sud' },
  { id: 'radar_044', name: 'Radar VGE-11', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.31800, lng: -4.03200, status: 'active', desc: 'Radar fixe VGE Treichville' },
  { id: 'radar_045', name: 'Radar VGE-12', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.31600, lng: -4.03400, status: 'active', desc: 'Radar fixe VGE vers port' },
  { id: 'radar_046', name: 'Radar VGE-13', type: 'mobile', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.31400, lng: -4.03600, status: 'active', desc: 'Zone de controle mobile VGE sud' },
  { id: 'radar_047', name: 'Radar VGE-14', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.34000, lng: -4.01000, status: 'active', desc: 'Radar fixe VGE entree Angre' },
  { id: 'radar_048', name: 'Radar VGE-15', type: 'fixed', axis: 'Boulevard Valery Giscard d\'Estaing', lat: 5.34200, lng: -4.00800, status: 'active', desc: 'Radar fixe VGE zone Angre' },

  // -----------------------------------------------------------------------
  // Boulevard de l'aeroport — 80 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_049', name: 'Radar Aeroport-01', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.34800, lng: -3.93600, status: 'active', desc: 'Radar fixe entree boulevard aeroport' },
  { id: 'radar_050', name: 'Radar Aeroport-02', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.35000, lng: -3.93800, status: 'active', desc: 'Radar fixe direction aeroport' },
  { id: 'radar_051', name: 'Radar Aeroport-03', type: 'pedagogical', axis: 'Boulevard de l\'aeroport', lat: 5.35200, lng: -3.94000, status: 'active', desc: 'Radar pedagogique zone fret' },
  { id: 'radar_052', name: 'Radar Aeroport-04', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.35400, lng: -3.94200, status: 'active', desc: 'Radar fixe approche terminal' },
  { id: 'radar_053', name: 'Radar Aeroport-05', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.35600, lng: -3.94400, status: 'active', desc: 'Radar fixe devant aeroport FHB' },
  { id: 'radar_054', name: 'Radar Aeroport-06', type: 'mobile', axis: 'Boulevard de l\'aeroport', lat: 5.35800, lng: -3.94600, status: 'active', desc: 'Zone de controle mobile boulevard aeroport' },
  { id: 'radar_055', name: 'Radar Aeroport-07', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.34600, lng: -3.93400, status: 'active', desc: 'Radar fixe carrefour aeroport-Cocody' },
  { id: 'radar_056', name: 'Radar Aeroport-08', type: 'pedagogical', axis: 'Boulevard de l\'aeroport', lat: 5.36000, lng: -3.94800, status: 'active', desc: 'Radar pedagogique sortie aeroport' },
  { id: 'radar_057', name: 'Radar Aeroport-09', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.36200, lng: -3.95000, status: 'active', desc: 'Radar fixe zone cargo' },
  { id: 'radar_058', name: 'Radar Aeroport-10', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.34400, lng: -3.93200, status: 'active', desc: 'Radar fixe debut boulevard aeroport' },
  { id: 'radar_059', name: 'Radar Aeroport-11', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.36400, lng: -3.95200, status: 'active', desc: 'Radar fixe fin boulevard aeroport' },
  { id: 'radar_060', name: 'Radar Aeroport-12', type: 'fixed', axis: 'Boulevard de l\'aeroport', lat: 5.35100, lng: -3.93900, status: 'active', desc: 'Radar fixe entre fret et terminal' },

  // -----------------------------------------------------------------------
  // Voie express Adjame Yopougon — 80 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_061', name: 'Radar VEAdj-01', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.36200, lng: -4.03800, status: 'active', desc: 'Radar fixe entree voie express Adjame' },
  { id: 'radar_062', name: 'Radar VEAdj-02', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.36100, lng: -4.04200, status: 'active', desc: 'Radar fixe direction Yopougon' },
  { id: 'radar_063', name: 'Radar VEAdj-03', type: 'pedagogical', axis: 'Voie express Adjame Yopougon', lat: 5.36000, lng: -4.04600, status: 'active', desc: 'Radar pedagogique zone gare Adjame' },
  { id: 'radar_064', name: 'Radar VEAdj-04', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35900, lng: -4.05000, status: 'active', desc: 'Radar fixe voie express centre' },
  { id: 'radar_065', name: 'Radar VEAdj-05', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35800, lng: -4.05400, status: 'active', desc: 'Radar fixe approche Yopougon' },
  { id: 'radar_066', name: 'Radar VEAdj-06', type: 'mobile', axis: 'Voie express Adjame Yopougon', lat: 5.35700, lng: -4.05800, status: 'active', desc: 'Zone de controle mobile voie express' },
  { id: 'radar_067', name: 'Radar VEAdj-07', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35600, lng: -4.06200, status: 'active', desc: 'Radar fixe entree Yopougon' },
  { id: 'radar_068', name: 'Radar VEAdj-08', type: 'pedagogical', axis: 'Voie express Adjame Yopougon', lat: 5.35500, lng: -4.06600, status: 'active', desc: 'Radar pedagogique zone Yopougon' },
  { id: 'radar_069', name: 'Radar VEAdj-09', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35400, lng: -4.07000, status: 'active', desc: 'Radar fixe Yopougon centre' },
  { id: 'radar_070', name: 'Radar VEAdj-10', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.36300, lng: -4.03400, status: 'active', desc: 'Radar fixe sortie Adjame vers voie express' },
  { id: 'radar_071', name: 'Radar VEAdj-11', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35300, lng: -4.07400, status: 'active', desc: 'Radar fixe Yopougon Niangon' },
  { id: 'radar_072', name: 'Radar VEAdj-12', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35200, lng: -4.07800, status: 'active', desc: 'Radar fixe fin voie express Yopougon' },
  { id: 'radar_073', name: 'Radar VEAdj-13', type: 'mobile', axis: 'Voie express Adjame Yopougon', lat: 5.35100, lng: -4.08200, status: 'active', desc: 'Zone de controle mobile Yopougon ouest' },
  { id: 'radar_074', name: 'Radar VEAdj-14', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.35000, lng: -4.08600, status: 'active', desc: 'Radar fixe terminus voie express' },
  { id: 'radar_075', name: 'Radar VEAdj-15', type: 'fixed', axis: 'Voie express Adjame Yopougon', lat: 5.36400, lng: -4.03000, status: 'active', desc: 'Radar fixe debut voie express Adjame' },

  // -----------------------------------------------------------------------
  // Autoroute Abidjan-Bassam — 110 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_076', name: 'Radar Bassam-01', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.30800, lng: -3.92000, status: 'active', desc: 'Radar fixe entree autoroute Bassam' },
  { id: 'radar_077', name: 'Radar Bassam-02', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.30600, lng: -3.90000, status: 'active', desc: 'Radar fixe km 5 autoroute' },
  { id: 'radar_078', name: 'Radar Bassam-03', type: 'pedagogical', axis: 'Autoroute Abidjan-Bassam', lat: 5.30400, lng: -3.88000, status: 'active', desc: 'Radar pedagogique zone Bingerville' },
  { id: 'radar_079', name: 'Radar Bassam-04', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.30200, lng: -3.86000, status: 'active', desc: 'Radar fixe km 10 autoroute' },
  { id: 'radar_080', name: 'Radar Bassam-05', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.30000, lng: -3.84000, status: 'active', desc: 'Radar fixe zone Mondoukou' },
  { id: 'radar_081', name: 'Radar Bassam-06', type: 'mobile', axis: 'Autoroute Abidjan-Bassam', lat: 5.29800, lng: -3.82000, status: 'active', desc: 'Zone de controle mobile autoroute' },
  { id: 'radar_082', name: 'Radar Bassam-07', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.29600, lng: -3.80000, status: 'active', desc: 'Radar fixe km 20 autoroute' },
  { id: 'radar_083', name: 'Radar Bassam-08', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.29400, lng: -3.78000, status: 'active', desc: 'Radar fixe approche Bassam' },
  { id: 'radar_084', name: 'Radar Bassam-09', type: 'pedagogical', axis: 'Autoroute Abidjan-Bassam', lat: 5.29200, lng: -3.76000, status: 'active', desc: 'Radar pedagogique entree Bassam' },
  { id: 'radar_085', name: 'Radar Bassam-10', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.29000, lng: -3.74000, status: 'active', desc: 'Radar fixe Grand-Bassam ville' },
  { id: 'radar_086', name: 'Radar Bassam-11', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.31000, lng: -3.94000, status: 'active', desc: 'Radar fixe sortie Abidjan vers Bassam' },
  { id: 'radar_087', name: 'Radar Bassam-12', type: 'mobile', axis: 'Autoroute Abidjan-Bassam', lat: 5.30100, lng: -3.85000, status: 'active', desc: 'Zone de controle mobile km 12' },
  { id: 'radar_088', name: 'Radar Bassam-13', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.29700, lng: -3.81000, status: 'active', desc: 'Radar fixe km 18 autoroute' },
  { id: 'radar_089', name: 'Radar Bassam-14', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.29300, lng: -3.77000, status: 'active', desc: 'Radar fixe km 25 autoroute' },
  { id: 'radar_090', name: 'Radar Bassam-15', type: 'fixed', axis: 'Autoroute Abidjan-Bassam', lat: 5.28800, lng: -3.72000, status: 'active', desc: 'Radar fixe fin autoroute Bassam' },

  // -----------------------------------------------------------------------
  // Boulevard lagunaire — 60 km/h
  // -----------------------------------------------------------------------
  { id: 'radar_091', name: 'Radar Lagu-01', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.31900, lng: -4.02600, status: 'active', desc: 'Radar fixe entree boulevard lagunaire' },
  { id: 'radar_092', name: 'Radar Lagu-02', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.31950, lng: -4.02800, status: 'active', desc: 'Radar fixe direction Hotel Ivoire' },
  { id: 'radar_093', name: 'Radar Lagu-03', type: 'pedagogical', axis: 'Boulevard lagunaire', lat: 5.32000, lng: -4.03000, status: 'active', desc: 'Radar pedagogique zone presidentielle' },
  { id: 'radar_094', name: 'Radar Lagu-04', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32050, lng: -4.03200, status: 'active', desc: 'Radar fixe face lagune' },
  { id: 'radar_095', name: 'Radar Lagu-05', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32100, lng: -4.03400, status: 'active', desc: 'Radar fixe centre boulevard lagunaire' },
  { id: 'radar_096', name: 'Radar Lagu-06', type: 'pedagogical', axis: 'Boulevard lagunaire', lat: 5.32150, lng: -4.03600, status: 'active', desc: 'Radar pedagogique zone Cocody bord lagune' },
  { id: 'radar_097', name: 'Radar Lagu-07', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32200, lng: -4.03800, status: 'active', desc: 'Radar fixe vers Blockhauss' },
  { id: 'radar_098', name: 'Radar Lagu-08', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32250, lng: -4.04000, status: 'active', desc: 'Radar fixe zone Blockhauss' },
  { id: 'radar_099', name: 'Radar Lagu-09', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.31850, lng: -4.02400, status: 'active', desc: 'Radar fixe debut boulevard lagunaire Plateau' },
  { id: 'radar_100', name: 'Radar Lagu-10', type: 'pedagogical', axis: 'Boulevard lagunaire', lat: 5.32300, lng: -4.04200, status: 'active', desc: 'Radar pedagogique fin boulevard lagunaire' },
  { id: 'radar_101', name: 'Radar Lagu-11', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32350, lng: -4.04400, status: 'active', desc: 'Radar fixe sortie lagunaire vers Cocody' },
  { id: 'radar_102', name: 'Radar Lagu-12', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.31800, lng: -4.02200, status: 'active', desc: 'Radar fixe jonction lagunaire-Plateau' },
  { id: 'radar_103', name: 'Radar Lagu-13', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32400, lng: -4.04600, status: 'active', desc: 'Radar fixe lagunaire terminus Cocody' },
  { id: 'radar_104', name: 'Radar Lagu-14', type: 'mobile', axis: 'Boulevard lagunaire', lat: 5.32450, lng: -4.04800, status: 'active', desc: 'Zone de controle mobile boulevard lagunaire' },
  { id: 'radar_105', name: 'Radar Lagu-15', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32500, lng: -4.05000, status: 'active', desc: 'Radar fixe fin lagunaire direction Riviera' },
  { id: 'radar_106', name: 'Radar Lagu-16', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32550, lng: -4.05200, status: 'active', desc: 'Radar fixe lagunaire zone residentielle' },
  { id: 'radar_107', name: 'Radar Lagu-17', type: 'pedagogical', axis: 'Boulevard lagunaire', lat: 5.32600, lng: -4.05400, status: 'active', desc: 'Radar pedagogique lagunaire Riviera' },
  { id: 'radar_108', name: 'Radar Lagu-18', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32650, lng: -4.05600, status: 'active', desc: 'Radar fixe lagunaire Riviera Golf' },
  { id: 'radar_109', name: 'Radar Lagu-19', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32700, lng: -4.05800, status: 'active', desc: 'Radar fixe lagunaire Riviera Palmeraie' },
  { id: 'radar_110', name: 'Radar Lagu-20', type: 'mobile', axis: 'Boulevard lagunaire', lat: 5.32750, lng: -4.06000, status: 'active', desc: 'Zone de controle mobile lagunaire est' },
  { id: 'radar_111', name: 'Radar Lagu-21', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32800, lng: -4.06200, status: 'active', desc: 'Radar fixe lagunaire vers Bingerville' },
  { id: 'radar_112', name: 'Radar Lagu-22', type: 'fixed', axis: 'Boulevard lagunaire', lat: 5.32850, lng: -4.06400, status: 'active', desc: 'Radar fixe lagunaire fin de section' },
  { id: 'radar_113', name: 'Radar Lagu-23', type: 'pedagogical', axis: 'Boulevard lagunaire', lat: 5.32900, lng: -4.06600, status: 'active', desc: 'Radar pedagogique lagunaire terminus est' },
];

// ---------------------------------------------------------------------------
// Limite de vitesse par axe
// ---------------------------------------------------------------------------

const SPEED_BY_AXIS = {
  'Boulevard de la Paix Plateau (Carena)': 60,
  'Boulevard de France': 60,
  'Boulevard C2 Cocody-Plateau': 60,
  'Boulevard Valery Giscard d\'Estaing': 80,
  'Boulevard de l\'aeroport': 80,
  'Voie express Adjame Yopougon': 80,
  'Autoroute Abidjan-Bassam': 110,
  'Boulevard lagunaire': 60,
};

// ---------------------------------------------------------------------------
// Mapping type radar → type ZoneVitesse
// ---------------------------------------------------------------------------

function mapRadarType(radarType) {
  switch (radarType) {
    case 'fixed': return 'radar';
    case 'pedagogical': return 'radar';
    case 'mobile': return 'axe';
    default: return 'radar';
  }
}

// ---------------------------------------------------------------------------
// seedDefaultZones — insere les 113 radars si count <= 12 (anciennes zones)
// ---------------------------------------------------------------------------

/**
 * Insere les 113 radars d'Abidjan.
 * Si <= 12 zones existent (anciennes generiques), les supprime et re-insere.
 * Si > 12 existent (deja les nouvelles), on skip.
 *
 * @param {string|null} entrepriseId
 */
async function seedDefaultZones(entrepriseId) {
  try {
    const filter = entrepriseId ? { entrepriseId } : {};
    const count = await ZoneVitesse.countDocuments(filter);

    // Deja les nouvelles zones → skip
    if (count > 12) {
      console.log(`[SeedZones] ${count} zones existantes pour entreprise ${entrepriseId || '(global)'} — skip`);
      return;
    }

    // Supprimer les anciennes zones generiques si elles existent
    if (count > 0) {
      await ZoneVitesse.deleteMany(filter);
      console.log(`[SeedZones] ${count} anciennes zones supprimees pour entreprise ${entrepriseId || '(global)'}`);
    }

    const now = new Date().toISOString();
    const docs = RADARS_ABIDJAN.map(r => ({
      id: 'ZV-' + r.id,
      entrepriseId: entrepriseId || null,
      nom: r.name,
      type: mapRadarType(r.type),
      vitesseMax: SPEED_BY_AXIS[r.axis],
      tolerance: 5,
      coordinates: { lat: r.lat, lng: r.lng, rayon: 150 },
      polygone: [],
      actif: r.status === 'active',
      dateCreation: now,
    }));

    await ZoneVitesse.insertMany(docs);
    console.log(`[SeedZones] ${docs.length} radars inseres pour Abidjan (entreprise ${entrepriseId || '(global)'})`);
  } catch (err) {
    console.error('[SeedZones] Erreur:', err.message);
  }
}

/**
 * Force la suppression et re-insertion de toutes les zones.
 *
 * @param {string|null} entrepriseId
 */
async function reseedZones(entrepriseId) {
  try {
    const filter = entrepriseId ? { entrepriseId } : {};
    const deleted = await ZoneVitesse.deleteMany(filter);
    console.log(`[SeedZones] reseed: ${deleted.deletedCount} zones supprimees`);
    // Reset count to 0 so seedDefaultZones will insert
    await seedDefaultZones(entrepriseId);
  } catch (err) {
    console.error('[SeedZones] Erreur reseed:', err.message);
  }
}

module.exports = { seedDefaultZones, reseedZones };
