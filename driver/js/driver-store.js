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

    const [planningRes, versementsRes, coursesRes, signRes, chauffeurRes] = await Promise.all([
      supabase.from('fleet_planning').select('*').eq('chauffeur_id', id).eq('date', today),
      supabase.from('fleet_versements').select('*').eq('chauffeur_id', id).gte('date', monthStart).order('date', { ascending: false }),
      supabase.from('fleet_courses').select('*').eq('chauffeur_id', id).gte('date_heure', monthStart + 'T00:00:00'),
      supabase.from('fleet_signalements').select('*').eq('chauffeur_id', id).in('statut', ['ouvert', 'en_cours']),
      supabase.from('fleet_chauffeurs').select('score_conduite, redevance_quotidienne, objectif_ca, vehicule_assigne').eq('id', id).single()
    ]);

    const courses = (coursesRes.data || []).map(objToCamel);
    const versements = (versementsRes.data || []).map(objToCamel);
    const ch = chauffeurRes.data ? objToCamel(chauffeurRes.data) : {};

    return {
      planning: (planningRes.data || []).map(objToCamel),
      versements,
      alertes: (signRes.data || []).map(objToCamel),
      stats: {
        courses: courses.length,
        ca: courses.reduce((s, c) => s + (c.montantTtc || 0), 0),
        versementsTotal: versements.reduce((s, v) => s + (v.montantVerse || 0), 0),
        scoreConduite: ch.scoreConduite || 0
      },
      chauffeur: ch
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
    const { data: settings } = await supabase.from('fleet_settings').select('versements').limit(1).single();
    const { data: ch } = await supabase.from('fleet_chauffeurs').select('redevance_quotidienne').eq('id', id).single();
    return {
      settings: settings ? settings.versements : {},
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

  async getContrat() {
    // Contract data stored in chauffeur profile
    const id = this._chauffeurId();
    const { data } = await supabase.from('fleet_chauffeurs').select('date_debut_contrat, date_fin_contrat, redevance_quotidienne').eq('id', id).single();
    return data ? objToCamel(data) : null;
  },

  async accepterContrat() {
    return { success: true }; // Placeholder
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
    const { error } = await supabase.from('fleet_chauffeurs').update({
      location: { lat, lng, speed, heading, accuracy, updatedAt: new Date().toISOString() }
    }).eq('id', id);
    return error ? { error: error.message } : { success: true };
  },

  async sendLocationBatch(points) {
    // Send the latest point from the batch
    if (!points || points.length === 0) return { success: true };
    const last = points[points.length - 1];
    return this.sendLocation(last.lat, last.lng, last.speed, last.heading, last.accuracy);
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
