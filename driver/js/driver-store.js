/**
 * DriverStore — Acces direct Supabase pour la PWA chauffeur
 * Chaque appel requete les tables fleet_* scopees au chauffeur connecte
 */
const DriverStore = {

  _chauffeurId() {
    return DriverAuth.getChauffeurId();
  },

  // ===== DASHBOARD =====

  async getDashboard() {
    const id = this._chauffeurId();
    if (!id) return null;

    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';

    const [planningRes, versementsRes, coursesRes, signRes, chauffeurRes, caJourRes] = await Promise.all([
      supabase.from('fleet_planning').select('*').eq('chauffeur_id', id).eq('date', today),
      supabase.from('fleet_versements').select('*').eq('chauffeur_id', id).gte('date', monthStart).order('date', { ascending: false }),
      supabase.from('fleet_courses').select('*').eq('chauffeur_id', id).gte('date_heure', monthStart + 'T00:00:00'),
      supabase.from('fleet_signalements').select('*').eq('chauffeur_id', id).in('statut', ['ouvert', 'en_cours']),
      supabase.from('fleet_chauffeurs').select('prenom, nom, score_conduite, redevance_quotidienne, objectif_ca, objectif_ca_jour, type_contrat, role_flotte, jour_repos, jour_repos2, vehicule_assigne').eq('id', id).single(),
      supabase.from('fleet_ca_jour').select('*').eq('chauffeur_id', id).gte('date', monthStart).order('date', { ascending: false })
    ]);

    const courses = (coursesRes.data || []).map(objToCamel);
    const versements = (versementsRes.data || []).map(objToCamel);
    const ch = chauffeurRes.data ? objToCamel(chauffeurRes.data) : {};

    // CA du jour : c'est lui qui compte pour un salarie, la ou un locataire
    // regarde ce qu'il a verse. Source de reference : fleet_ca_jour, alimentee
    // depuis Yango. On retombe sur les courses si la synchronisation n'a pas
    // encore tourne, plutot que d'afficher zero a un chauffeur qui a roule.
    const caParJour = (caJourRes.data || []).map(objToCamel);
    const ligneDuJour = caParJour.find(l => String(l.date).slice(0, 10) === today);
    const caJour = ligneDuJour
      ? Number(ligneDuJour.caBrut || 0)
      : courses.filter(c => String(c.dateHeure || '').slice(0, 10) === today)
               .reduce((s, c) => s + (c.montantTtc || 0), 0);
    const caJourNet = ligneDuJour ? Number(ligneDuJour.caNet || 0) : null;
    const commissionJour = ligneDuJour ? Number(ligneDuJour.commissionYango || 0) : null;

    return {
      planning: (planningRes.data || []).map(objToCamel),
      versements,
      alertes: (signRes.data || []).map(objToCamel),
      stats: {
        courses: courses.length,
        ca: courses.reduce((s, c) => s + (c.montantTtc || 0), 0),
        caJour,
        caJourNet,
        commissionJour,
        caSynchronise: !!ligneDuJour,
        versementsTotal: versements.reduce((s, v) => s + (v.montantVerse || 0), 0),
        scoreConduite: ch.scoreConduite || 0
      },
      chauffeur: ch,
      caParJour
    };
  },

  // ===== PLANNING =====

  async getPlanning(from, to) {
    const id = this._chauffeurId();
    if (!id) return null;
    let query = supabase.from('fleet_planning').select('*').eq('chauffeur_id', id);
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    const { data } = await query.order('date');
    return (data || []).map(objToCamel);
  },

  async getAbsences() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_absences').select('*').eq('chauffeur_id', id).order('date_debut', { ascending: false });
    return (data || []).map(objToCamel);
  },

  async createAbsence(absence) {
    const id = this._chauffeurId();
    const row = objToSnake({ ...absence, chauffeurId: id });
    const { data, error } = await supabase.from('fleet_absences').insert(row).select().single();
    if (error) return { error: error.message };
    return objToCamel(data);
  },

  // ===== SERVICE / POINTAGE =====

  async getServiceToday() {
    const id = this._chauffeurId();
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('fleet_pointages').select('*').eq('chauffeur_id', id).eq('date', today).single();
    return data ? objToCamel(data) : null;
  },

  async startService() {
    const id = this._chauffeurId();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    const row = {
      chauffeur_id: id,
      date: today,
      statut: 'en_service',
      heure_debut: now,
      evenements: [{ type: 'debut', heure: now }]
    };
    const { data, error } = await supabase.from('fleet_pointages').insert(row).select().single();
    if (error) return { error: error.message };
    return objToCamel(data);
  },

  async pauseService() {
    const id = this._chauffeurId();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    const { data: existing } = await supabase.from('fleet_pointages').select('*').eq('chauffeur_id', id).eq('date', today).single();
    if (!existing) return { error: 'Pas de pointage' };
    const evts = existing.evenements || [];
    evts.push({ type: 'pause', heure: now });
    const { data } = await supabase.from('fleet_pointages').update({ statut: 'pause', evenements: evts }).eq('id', existing.id).select().single();
    return data ? objToCamel(data) : { error: 'Erreur' };
  },

  async resumeService() {
    const id = this._chauffeurId();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    const { data: existing } = await supabase.from('fleet_pointages').select('*').eq('chauffeur_id', id).eq('date', today).single();
    if (!existing) return { error: 'Pas de pointage' };
    const evts = existing.evenements || [];
    evts.push({ type: 'reprise', heure: now });
    const { data } = await supabase.from('fleet_pointages').update({ statut: 'en_service', evenements: evts }).eq('id', existing.id).select().single();
    return data ? objToCamel(data) : { error: 'Erreur' };
  },

  async endService() {
    const id = this._chauffeurId();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    const { data: existing } = await supabase.from('fleet_pointages').select('*').eq('chauffeur_id', id).eq('date', today).single();
    if (!existing) return { error: 'Pas de pointage' };
    const evts = existing.evenements || [];
    evts.push({ type: 'fin', heure: now });
    const { data } = await supabase.from('fleet_pointages').update({ statut: 'termine', heure_fin: now, evenements: evts }).eq('id', existing.id).select().single();
    return data ? objToCamel(data) : { error: 'Erreur' };
  },

  // ===== VERSEMENTS / DETTES =====

  async getDeadline() {
    const id = this._chauffeurId();
    // RPC dédié : fleet_settings n'est plus lisible par les chauffeurs
    // (la ligne contient les clés API dans integrations).
    const { data: versementsSettings } = await supabase.rpc('fleet_settings_versements');
    const { data: ch } = await supabase.from('fleet_chauffeurs').select('redevance_quotidienne').eq('id', id).single();
    return {
      settings: versementsSettings || {},
      redevance: ch ? ch.redevance_quotidienne : 0
    };
  },

  async getVersements() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_versements').select('*').eq('chauffeur_id', id).order('date', { ascending: false }).limit(30);
    return (data || []).map(objToCamel);
  },

  async getDettes() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_versements').select('*').eq('chauffeur_id', id).eq('en_retard', true).order('date', { ascending: false });
    return (data || []).map(objToCamel);
  },

  async createVersement(versement) {
    const id = this._chauffeurId();
    const row = objToSnake({ ...versement, chauffeurId: id, soumisParChauffeur: true });
    const { data, error } = await supabase.from('fleet_versements').insert(row).select().single();
    if (error) return { error: error.message };
    return objToCamel(data);
  },

  // ===== SIGNALEMENTS =====

  async getSignalements() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_signalements').select('*').eq('chauffeur_id', id).order('date_signalement', { ascending: false });
    return (data || []).map(objToCamel);
  },

  async createSignalement(signalement) {
    const id = this._chauffeurId();
    const row = objToSnake({ ...signalement, chauffeurId: id });
    const { data, error } = await supabase.from('fleet_signalements').insert(row).select().single();
    if (error) return { error: error.message };
    return objToCamel(data);
  },

  // ===== PROFIL =====

  async getProfil() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_chauffeurs').select('*').eq('id', id).single();
    return data ? objToCamel(data) : null;
  },

  /**
   * Contrat du chauffeur : le modele vient des parametres, les valeurs
   * personnelles de sa fiche. Le texte est renvoye deja prerempli.
   */
  async getContrat() {
    const id = this._chauffeurId();
    const [chRes, setRes] = await Promise.all([
      supabase.from('fleet_chauffeurs')
        .select('prenom, nom, telephone, date_debut_contrat, date_fin_contrat, redevance_quotidienne, salaire_mensuel, objectif_ca_jour, jour_repos, jour_repos2, vehicule_assigne, type_contrat, contrat_accepte, contrat_accepte_le, contrat_version')
        .eq('id', id).single(),
      // Les regles RLS interdisent fleet_settings au chauffeur — et il ne faut
      // surtout pas la lui ouvrir : elle contient les identifiants Yango.
      // Ce RPC n'expose que le contrat et les mentions publiques.
      supabase.rpc('fleet_contrat_modele')
    ]);
    if (chRes.error) {
      console.error('[Contrat] Lecture du chauffeur impossible :', chRes.error.message);
      return { erreur: chRes.error.message };
    }
    if (setRes && setRes.error) {
      console.error('[Contrat] Lecture du modele impossible :', setRes.error.message);
    }
    if (!chRes.data) return { erreur: 'Profil chauffeur introuvable' };

    const ch = objToCamel(chRes.data);
    const bloc = (setRes && setRes.data) || {};
    const modele = bloc.contrat || {};
    const ent = bloc.entreprise || {};

    let immat = '';
    if (ch.vehiculeAssigne) {
      const { data: v } = await supabase.from('fleet_vehicules').select('immatriculation').eq('id', ch.vehiculeAssigne).single();
      immat = (v && v.immatriculation) || '';
    }

    return {
      version: modele.version || 1,
      typeContrat: modele.typeContrat || 'CDI',
      poste: modele.poste || 'Chauffeur VTC',
      derniereMaj: modele.derniereMaj || null,
      texte: this._preremplirContrat(modele.texte || '', ch, ent, immat),
      chauffeur: ch,
      entreprise: ent
    };
  },

  /** Remplace les {{champs}} du modele par les donnees reelles du chauffeur. */
  _preremplirContrat(texte, ch, ent, immat) {
    if (!texte) return '';
    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const somme = (n) => Number(n || 0).toLocaleString('fr-FR');
    const jour = (j) => (j === 0 || j) ? JOURS[Number(j)] : '__________';
    const date = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '__________';
    const objectif = Number(ch.objectifCaJour || 0);

    const valeurs = {
      employeur: ent.nom || ent.raisonSociale || '__________',
      siege: ent.adresse || '__________',
      gerant: ent.gerant || ent.representant || '__________',
      civilite: 'Monsieur/Madame',   // aucune donnee de civilite en base
      nomComplet: `${ch.prenom || ''} ${ch.nom || ''}`.trim() || '__________',
      telephone: ch.telephone || '__________',
      dateDebut: date(ch.dateDebutContrat),
      plateforme: (ent.plateforme) || 'Yango',
      repos1: jour(ch.jourRepos),
      repos2: jour(ch.jourRepos2),
      heureDebut: ent.heureDebutService || '6 h 00',
      heureFin: ent.heureFinService || 'minuit',
      salaire: somme(ch.salaireMensuel),
      jourPaie: ent.jourPaie || '5',
      objectif: somme(objectif),
      objectifSemaine: somme(objectif * 5),
      immatriculation: immat || '__________'
    };
    return texte.replace(/\{\{(\w+)\}\}/g, (m, cle) => (cle in valeurs) ? valeurs[cle] : m);
  },

  /**
   * Enregistre VRAIMENT l'acceptation. Cette fonction ne faisait rien
   * auparavant : le chauffeur signait, l'ecran confirmait, et aucune trace
   * n'etait ecrite — la signature n'existait pas.
   */
  async accepterContrat(version) {
    const id = this._chauffeurId();
    if (!id) return { success: false, error: 'Chauffeur inconnu' };
    const { error } = await supabase.from('fleet_chauffeurs').update({
      contrat_accepte: true,
      contrat_accepte_le: new Date().toISOString(),
      contrat_version: Number(version) || 1,
      contrat_signe: true
    }).eq('id', id);
    if (error) {
      console.error('[Contrat] Acceptation non enregistree :', error.message);
      return { success: false, error: error.message };
    }
    // La copie locale doit refleter la base, sinon l'ecran redemanderait
    // la signature au prochain affichage.
    try {
      const cle = 'pilote_driver_chauffeur';
      const ch = JSON.parse(localStorage.getItem(cle) || '{}');
      ch.contratAccepte = true; ch.contratVersion = Number(version) || 1;
      ch.contratAccepteLe = new Date().toISOString();
      localStorage.setItem(cle, JSON.stringify(ch));
    } catch (e) {}
    return { success: true };
  },

  async getVehicule() {
    const id = this._chauffeurId();
    const { data: ch } = await supabase.from('fleet_chauffeurs').select('vehicule_assigne').eq('id', id).single();
    if (!ch || !ch.vehicule_assigne) return null;
    const { data } = await supabase.from('fleet_vehicules').select('*').eq('id', ch.vehicule_assigne).single();
    return data ? objToCamel(data) : null;
  },

  async getGps() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_gps').select('*').eq('chauffeur_id', id).order('date', { ascending: false }).limit(1).single();
    return data ? objToCamel(data) : null;
  },

  async getGpsScores() {
    return this.getGps();
  },

  // ===== NOTIFICATIONS =====

  async getNotifications(limit = 30) {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_notifications').select('*').eq('chauffeur_id', id).order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(objToCamel);
  },

  async markNotificationRead(notifId) {
    const { error } = await supabase.from('fleet_notifications').update({ statut: 'lue', date_lue: new Date().toISOString() }).eq('id', notifId);
    return error ? { error: error.message } : { success: true };
  },

  // ===== MESSAGERIE =====

  async getConversations() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_conversations').select('*').eq('chauffeur_id', id).order('dernier_message_date', { ascending: false });
    return (data || []).map(objToCamel);
  },

  async getConversation(convId) {
    const { data } = await supabase.from('fleet_conversations').select('*').eq('id', convId).single();
    return data ? objToCamel(data) : null;
  },

  async replyToConversation(convId, message) {
    const ch = DriverAuth.getChauffeur();
    const { data: conv } = await supabase.from('fleet_conversations').select('messages, non_lus_admin').eq('id', convId).single();
    if (!conv) return { error: 'Conversation non trouvee' };
    const messages = conv.messages || [];
    messages.push({
      id: crypto.randomUUID(),
      auteur: 'chauffeur',
      auteurNom: ch ? `${ch.prenom} ${ch.nom}` : 'Chauffeur',
      contenu: message,
      type: 'message',
      dateCreation: new Date().toISOString()
    });
    const { error } = await supabase.from('fleet_conversations').update({
      messages,
      dernier_message: message,
      dernier_message_date: new Date().toISOString(),
      non_lus_admin: (conv.non_lus_admin || 0) + 1
    }).eq('id', convId);
    return error ? { error: error.message } : { success: true };
  },

  // ===== LOCATION GPS =====

  async sendLocation(lat, lng, speed, heading, accuracy) {
    const id = this._chauffeurId();
    // Alimente aussi l'historique de trajet du jour (fleet_conduite_brute)
    this._trackSample(lat, lng, speed);
    const { error } = await supabase.from('fleet_chauffeurs').update({
      location: { lat, lng, speed, heading, accuracy, updatedAt: new Date().toISOString() }
    }).eq('id', id);
    return error ? { error: error.message } : { success: true };
  },

  async sendLocationBatch(points) {
    if (!points || points.length === 0) return { success: true };
    // Tous les points bufferisés vont dans l'historique de trajet
    // (avant : seul le dernier point était conservé, le reste était perdu)
    points.forEach(p => this._trackSample(p.lat, p.lng, p.speed, p.t ? new Date(p.t).toTimeString().slice(0, 8) : null));
    await this._flushTripSamples();
    const last = points[points.length - 1];
    return this.sendLocation(last.lat, last.lng, last.speed, last.heading, last.accuracy);
  },

  // ===== HISTORIQUE DE TRAJET (fleet_conduite_brute, 1 ligne par chauffeur+jour) =====

  _tripSamples: [],
  _tripFlushTimer: null,

  _trackSample(lat, lng, speed, heure) {
    if (lat == null || lng == null) return;
    this._tripSamples.push({ lat, lng, speed: speed || 0, heure: heure || new Date().toTimeString().slice(0, 8) });
    if (this._tripSamples.length >= 10) {
      this._flushTripSamples();
    } else if (!this._tripFlushTimer) {
      this._tripFlushTimer = setTimeout(() => this._flushTripSamples(), 60000);
    }
  },

  async _flushTripSamples() {
    if (this._tripFlushTimer) { clearTimeout(this._tripFlushTimer); this._tripFlushTimer = null; }
    if (!this._tripSamples.length) return;
    const id = this._chauffeurId();
    if (!id) { this._tripSamples = []; return; }
    const batch = this._tripSamples.splice(0);
    const today = new Date().toISOString().split('T')[0];
    try {
      const ch = (typeof DriverAuth !== 'undefined' && DriverAuth.getChauffeur) ? DriverAuth.getChauffeur() : null;
      const { error } = await supabase.rpc('fleet_append_gps_samples', {
        p_id: `CB-${id}-${today}`,
        p_chauffeur: id,
        p_vehicule: (ch && ch.vehiculeAssigne) || null,
        p_date: today,
        p_samples: batch
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      // Réseau KO : remettre les points en file pour le prochain flush (plafonné)
      this._tripSamples = batch.concat(this._tripSamples).slice(-500);
    }
  },

  // ===== CHECKLIST / ETAT DES LIEUX =====

  async getChecklistToday() {
    const id = this._chauffeurId();
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('fleet_checklist_vehicules').select('*').eq('chauffeur_id', id).eq('date', today).single();
    return data ? objToCamel(data) : null;
  },

  async getEtatLieuxToday() {
    return this.getChecklistToday();
  },

  async submitChecklist(checklist) {
    const id = this._chauffeurId();
    const ch = DriverAuth.getChauffeur();
    const row = objToSnake({ ...checklist, chauffeurId: id, vehiculeId: ch?.vehiculeAssigne || null });
    const { data, error } = await supabase.from('fleet_checklist_vehicules').insert(row).select().single();
    if (error) return { error: error.message };
    return objToCamel(data);
  },

  // ===== CONTRAVENTIONS =====

  async getContraventions() {
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_contraventions').select('*').eq('chauffeur_id', id).order('date', { ascending: false });
    return (data || []).map(objToCamel);
  },

  async contesterContravention(contraId, motif) {
    const { error } = await supabase.from('fleet_contraventions').update({ motif_contestation: motif }).eq('id', contraId);
    return error ? { error: error.message } : { success: true };
  },

  // ===== MAINTENANCES =====

  async getMaintenances() {
    const ch = DriverAuth.getChauffeur();
    if (!ch || !ch.vehiculeAssigne) return [];
    const { data } = await supabase.from('fleet_vehicules').select('maintenances_planifiees').eq('id', ch.vehiculeAssigne).single();
    return data ? (data.maintenances_planifiees || []) : [];
  },

  async signalMaintenanceProblem(problemData) {
    const id = this._chauffeurId();
    const ch = DriverAuth.getChauffeur();
    const row = objToSnake({
      chauffeurId: id,
      vehiculeId: ch?.vehiculeAssigne || null,
      type: 'panne',
      titre: problemData.titre || 'Probleme signale',
      description: problemData.description || '',
      urgence: problemData.urgence || 'normale',
      statut: 'ouvert'
    });
    const { data, error } = await supabase.from('fleet_signalements').insert(row).select().single();
    if (error) return { error: error.message };
    return objToCamel(data);
  },

  // ===== COURSES / TRAJETS =====

  async getTrajets(from, to) {
    const id = this._chauffeurId();
    let query = supabase.from('fleet_courses').select('*').eq('chauffeur_id', id);
    if (from) query = query.gte('date_heure', from + 'T00:00:00');
    if (to) query = query.lte('date_heure', to + 'T23:59:59');
    const { data } = await query.order('date_heure', { ascending: false });
    return (data || []).map(objToCamel);
  },

  // ===== STUBS (need Edge Functions for full implementation) =====

  async getYangoActivity() { return null; },
  async getVapidKey() { return null; },
  async subscribePush(sub) { return { error: 'Non configure' }; },
  async unsubscribePush(endpoint) { return { error: 'Non configure' }; },
  async pollMessages() { return null; },
  async markConversationRead(id) { return { success: true }; },
  async sendBehaviorEvents(batch) { return { error: 'Non configure' }; },
  async finalizeBehaviorSession() { return { error: 'Non configure' }; },
  async getBehaviorStatus() { return null; },
  async getClassement() { return null; },
  async getResumeHebdo() { return null; },
  async createWaveCheckout(data) { return { error: 'Non configure' }; },
  async getWaveStatus(id) { return null; }
};
