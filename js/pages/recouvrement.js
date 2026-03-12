/**
 * RecouvrementPage — Agent vocal IA pour le recouvrement de dettes
 * Utilise ElevenLabs Conversational AI + Twilio pour appeler les chauffeurs
 */
const RecouvrementPage = {
  _debtors: [],
  _calls: [],
  _status: null,

  async render() {
    const container = document.getElementById('page-content');
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
      <iconify-icon icon="svg-spinners:ring-resize" style="font-size:2rem;"></iconify-icon>
      <p>Chargement...</p>
    </div>`;

    try {
      const [status, debtors, calls] = await Promise.all([
        Store.elStatus(),
        Store.elDebtors().catch(() => []),
        Store.elCalls().catch(() => [])
      ]);
      this._status = status;
      this._debtors = debtors;
      this._calls = calls;
    } catch (e) {
      this._status = { ready: false, config: {} };
      this._debtors = [];
      this._calls = [];
    }

    container.innerHTML = this._template();
    this._bindEvents();
  },

  destroy() {},

  _template() {
    if (!this._status || !this._status.ready) {
      return this._configTemplate();
    }
    return `
      ${this._kpiTemplate()}
      ${this._debtorsTemplate()}
      ${this._callHistoryTemplate()}
    `;
  },

  // =================== CONFIGURATION ===================

  _configTemplate() {
    const cfg = this._status?.config || {};
    return `
      <div class="card" style="border-left:4px solid #f59e0b;margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:settings-bold-duotone" style="color:#f59e0b;"></iconify-icon> Configuration requise</span>
        </div>
        <div style="padding:var(--space-md);">
          <p style="color:var(--text-muted);margin-bottom:var(--space-md);">
            L'agent vocal de recouvrement utilise ElevenLabs + Twilio. Configurez les variables d'environnement suivantes sur Vercel :
          </p>
          <div style="display:grid;gap:8px;">
            ${this._configItem('ELEVENLABS_API_KEY', cfg.apiKey)}
            ${this._configItem('ELEVENLABS_AGENT_ID', cfg.agentId)}
            ${this._configItem('ELEVENLABS_PHONE_NUMBER_ID', cfg.phoneNumberId)}
            ${this._configItem('ELEVENLABS_WEBHOOK_SECRET', cfg.webhookSecret, true)}
          </div>
          <div style="margin-top:var(--space-lg);padding:var(--space-md);background:var(--bg-secondary);border-radius:var(--radius-md);">
            <p style="font-weight:600;margin-bottom:8px;"><iconify-icon icon="solar:info-circle-bold-duotone" style="color:#3b82f6;"></iconify-icon> Étapes de configuration :</p>
            <ol style="color:var(--text-muted);padding-left:20px;line-height:1.8;">
              <li>Créez un compte <a href="https://elevenlabs.io" target="_blank" style="color:#3b82f6;">ElevenLabs</a> et récupérez votre API Key</li>
              <li>Importez votre numéro Twilio dans ElevenLabs (Dashboard > Phone Numbers)</li>
              <li>Ajoutez <code>ELEVENLABS_API_KEY</code> et <code>ELEVENLABS_PHONE_NUMBER_ID</code> sur Vercel</li>
              <li>Cliquez sur "Créer l'agent" ci-dessous pour générer l'agent vocal</li>
              <li>Ajoutez le <code>ELEVENLABS_AGENT_ID</code> retourné sur Vercel</li>
              <li>Configurez le webhook post-appel : <code>https://volt-vtc.vercel.app/api/elevenlabs/webhook</code></li>
            </ol>
          </div>
          ${cfg.apiKey && cfg.phoneNumberId && !cfg.agentId ? `
            <button id="btn-setup-agent" class="btn btn-primary" style="margin-top:var(--space-md);width:100%;">
              <iconify-icon icon="solar:robot-bold-duotone"></iconify-icon> Créer l'agent vocal
            </button>
          ` : ''}
        </div>
      </div>`;
  },

  _configItem(name, ok, optional) {
    const icon = ok
      ? '<iconify-icon icon="solar:check-circle-bold" style="color:#22c55e;"></iconify-icon>'
      : optional
        ? '<iconify-icon icon="solar:minus-circle-bold" style="color:#94a3b8;"></iconify-icon>'
        : '<iconify-icon icon="solar:close-circle-bold" style="color:#ef4444;"></iconify-icon>';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
      ${icon}
      <code style="font-size:0.85rem;">${name}</code>
      ${ok ? '<span style="color:#22c55e;font-size:0.8rem;margin-left:auto;">Configuré</span>' : optional ? '<span style="color:#94a3b8;font-size:0.8rem;margin-left:auto;">Optionnel</span>' : '<span style="color:#ef4444;font-size:0.8rem;margin-left:auto;">Manquant</span>'}
    </div>`;
  },

  // =================== KPIs ===================

  _kpiTemplate() {
    const totalDette = this._debtors.reduce((s, d) => s + d.dette, 0);
    const nbDebtors = this._debtors.length;
    const todayCalls = this._calls.filter(c => c.dateAppel === new Date().toISOString().split('T')[0]);
    const successCalls = this._calls.filter(c => c.resultat === 'success');
    const successRate = this._calls.length > 0
      ? Math.round((successCalls.length / this._calls.filter(c => c.statut === 'termine').length) * 100) || 0
      : 0;

    return `
      <div class="kpi-grid" style="margin-top:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon" style="background:linear-gradient(135deg,#ef4444,#dc2626);"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(totalDette)}</div>
          <div class="kpi-label">Dette totale</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706);"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${nbDebtors}</div>
          <div class="kpi-label">Chauffeurs endettés</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon" style="background:linear-gradient(135deg,#3b82f6,#2563eb);"><iconify-icon icon="solar:phone-calling-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${todayCalls.length}</div>
          <div class="kpi-label">Appels aujourd'hui</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon" style="background:linear-gradient(135deg,#22c55e,#16a34a);"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${successRate}%</div>
          <div class="kpi-label">Taux de succès</div>
        </div>
      </div>`;
  },

  // =================== LISTE DÉBITEURS ===================

  _debtorsTemplate() {
    if (this._debtors.length === 0) {
      return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #22c55e;text-align:center;padding:var(--space-xl);color:var(--text-muted);">
        <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:2rem;color:#22c55e;display:block;margin-bottom:8px;"></iconify-icon>
        Aucune dette en cours
      </div>`;
    }

    const rows = this._debtors.map(d => {
      const initials = ((d.prenom || '')[0] || '') + ((d.nom || '')[0] || '');
      const callStatus = d.appeleAujourdhui
        ? '<span style="font-size:0.75rem;background:#dbeafe;color:#2563eb;padding:2px 8px;border-radius:12px;">Appelé</span>'
        : '';
      const lastCallInfo = d.dernierAppel
        ? `<span style="font-size:0.75rem;color:var(--text-muted);">Dernier appel : ${Utils.formatDate(d.dernierAppel.dateAppel)} — ${this._statutLabel(d.dernierAppel.statut)}</span>`
        : '';

      return `<div class="list-row" style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-md);border-bottom:1px solid var(--border-color);">
        <div style="display:flex;align-items:center;gap:12px;flex:1;">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.85rem;">${initials}</div>
          <div>
            <div style="font-weight:600;">${d.prenom || ''} ${d.nom || ''}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${d.telephone || 'Pas de téléphone'} ${callStatus}</div>
            ${lastCallInfo ? `<div>${lastCallInfo}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;display:flex;align-items:center;gap:12px;">
          <div>
            <div style="font-weight:700;color:#ef4444;">${Utils.formatCurrency(d.dette)}</div>
          </div>
          ${d.telephone ? `
            <button class="btn-call" data-id="${d.id}" style="background:#3b82f6;color:white;border:none;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer;" title="Appeler">
              <iconify-icon icon="solar:phone-bold" style="font-size:1.1rem;"></iconify-icon>
            </button>
          ` : ''}
        </div>
      </div>`;
    }).join('');

    return `
      <div class="card" style="margin-top:var(--space-lg);border-left:4px solid #ef4444;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="card-title"><iconify-icon icon="solar:phone-calling-bold-duotone" style="color:#ef4444;"></iconify-icon> Chauffeurs endettés (${this._debtors.length})</span>
          <button id="btn-call-all" class="btn btn-sm" style="background:#ef4444;color:white;border:none;border-radius:var(--radius-md);padding:6px 16px;cursor:pointer;font-size:0.85rem;">
            <iconify-icon icon="solar:phone-calling-rounded-bold"></iconify-icon> Appeler tous
          </button>
        </div>
        <div style="max-height:500px;overflow-y:auto;">
          ${rows}
        </div>
      </div>`;
  },

  // =================== HISTORIQUE DES APPELS ===================

  _callHistoryTemplate() {
    if (this._calls.length === 0) {
      return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #94a3b8;text-align:center;padding:var(--space-xl);color:var(--text-muted);">
        <iconify-icon icon="solar:history-bold-duotone" style="font-size:2rem;color:#94a3b8;display:block;margin-bottom:8px;"></iconify-icon>
        Aucun appel effectué
      </div>`;
    }

    const chauffeurs = Store.get('chauffeurs') || [];
    const rows = this._calls.slice(0, 50).map(c => {
      const ch = chauffeurs.find(x => x.id === c.chauffeurId);
      const name = ch ? `${ch.prenom || ''} ${ch.nom || ''}` : c.chauffeurId;
      const statutBadge = this._statutBadge(c.statut);
      const resultatIcon = c.resultat === 'success'
        ? '<iconify-icon icon="solar:check-circle-bold" style="color:#22c55e;"></iconify-icon>'
        : c.resultat === 'failure'
          ? '<iconify-icon icon="solar:close-circle-bold" style="color:#ef4444;"></iconify-icon>'
          : '<iconify-icon icon="solar:minus-circle-bold" style="color:#94a3b8;"></iconify-icon>';

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px var(--space-md);border-bottom:1px solid var(--border-color);font-size:0.9rem;">
        <div style="display:flex;align-items:center;gap:10px;flex:1;">
          ${resultatIcon}
          <div>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">
              ${Utils.formatDate(c.dateAppel)} • ${c.duree ? Math.round(c.duree) + 's' : '—'} • ${c.declenchement === 'automatique' ? 'Auto' : 'Manuel'}
            </div>
            ${c.resume ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.resume}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;color:#ef4444;">${Utils.formatCurrency(c.montantDette)}</span>
          ${statutBadge}
        </div>
      </div>`;
    }).join('');

    return `
      <div class="card" style="margin-top:var(--space-lg);border-left:4px solid #3b82f6;">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:history-bold-duotone" style="color:#3b82f6;"></iconify-icon> Historique des appels</span>
        </div>
        <div style="max-height:400px;overflow-y:auto;">
          ${rows}
        </div>
      </div>`;
  },

  _statutLabel(statut) {
    const map = {
      en_cours: 'En cours',
      termine: 'Terminé',
      echoue: 'Échoué',
      pas_repondu: 'Pas de réponse',
      occupe: 'Occupé'
    };
    return map[statut] || statut;
  },

  _statutBadge(statut) {
    const colors = {
      en_cours: '#3b82f6',
      termine: '#22c55e',
      echoue: '#ef4444',
      pas_repondu: '#f59e0b',
      occupe: '#94a3b8'
    };
    const color = colors[statut] || '#94a3b8';
    return `<span style="font-size:0.75rem;background:${color}20;color:${color};padding:2px 8px;border-radius:12px;">${this._statutLabel(statut)}</span>`;
  },

  // =================== EVENTS ===================

  _bindEvents() {
    // Bouton Créer l'agent
    const setupBtn = document.getElementById('btn-setup-agent');
    if (setupBtn) {
      setupBtn.addEventListener('click', async () => {
        setupBtn.disabled = true;
        setupBtn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon> Création en cours...';
        try {
          const result = await Store.elSetupAgent();
          Toast.success(`Agent créé ! ID : ${result.agent_id}`);
          alert('Agent créé avec succès !\n\nAjoutez cette variable sur Vercel :\nELEVENLABS_AGENT_ID=' + result.agent_id);
        } catch (e) {
          Toast.error('Erreur : ' + e.message);
          setupBtn.disabled = false;
          setupBtn.innerHTML = '<iconify-icon icon="solar:robot-bold-duotone"></iconify-icon> Créer l\'agent vocal';
        }
      });
    }

    // Boutons d'appel individuels
    document.querySelectorAll('.btn-call').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const debtor = this._debtors.find(d => d.id === id);
        if (!debtor) return;
        if (!confirm(`Appeler ${debtor.prenom} ${debtor.nom} pour une dette de ${Utils.formatCurrency(debtor.dette)} ?`)) return;

        btn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize" style="font-size:1.1rem;"></iconify-icon>';
        btn.disabled = true;

        try {
          const result = await Store.elCall(id);
          Toast.success(`Appel lancé vers ${result.chauffeur}`);
          // Rafraîchir
          setTimeout(() => this.render(), 2000);
        } catch (e) {
          Toast.error('Erreur : ' + e.message);
          btn.innerHTML = '<iconify-icon icon="solar:phone-bold" style="font-size:1.1rem;"></iconify-icon>';
          btn.disabled = false;
        }
      });
    });

    // Bouton Appeler tous
    const callAllBtn = document.getElementById('btn-call-all');
    if (callAllBtn) {
      callAllBtn.addEventListener('click', async () => {
        const nb = this._debtors.filter(d => !d.appeleAujourdhui && d.telephone).length;
        if (nb === 0) {
          Toast.info('Tous les chauffeurs ont déjà été appelés aujourd\'hui');
          return;
        }
        if (!confirm(`Lancer ${nb} appel(s) automatiques vers les chauffeurs endettés ?`)) return;

        callAllBtn.disabled = true;
        callAllBtn.innerHTML = '<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon> En cours...';

        try {
          const result = await Store.elCallAllDebtors();
          Toast.success(result.message);
          setTimeout(() => this.render(), 3000);
        } catch (e) {
          Toast.error('Erreur : ' + e.message);
          callAllBtn.disabled = false;
          callAllBtn.innerHTML = '<iconify-icon icon="solar:phone-calling-rounded-bold"></iconify-icon> Appeler tous';
        }
      });
    }
  }
};
