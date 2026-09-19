/**
 * Utils - Formatting, ID generation, helpers
 */
const Utils = {
  // Escape HTML to prevent XSS when inserting user content into innerHTML
  escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // Format currency in FCFA
  formatCurrency(amount, decimals = 0) {
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(Math.round(amount));
    return `${formatted} FCFA`;
  },

  // Format number with French locale
  formatNumber(num, decimals = 0) {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  },

  // Format percentage
  formatPercent(value, decimals = 1) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  },

  // Format date in French
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  // Format date with month name
  formatDateLong(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  },

  // Format date short (month year)
  formatMonthYear(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  },

  // Format relative time
  timeAgo(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`;
    return Utils.formatDate(dateStr);
  },

  // Generate unique ID with prefix
  // Horodatage base36 + aléa : un simple nombre aléatoire à 6 chiffres
  // finit par entrer en collision avec une clé primaire existante
  // (l'insertion Supabase échoue alors et l'enregistrement est perdu).
  generateId(prefix) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${ts}${rand}`;
  },

  // Get initials from name
  getInitials(prenom, nom) {
    return `${(prenom || '')[0] || ''}${(nom || '')[0] || ''}`.toUpperCase();
  },

  // Avatar color from string
  getAvatarColor(str) {
    const colors = [
      '#635bff', '#13deb9', '#ffae1f', '#ef4444', '#635bff',
      '#f5512e', '#13deb9', '#f5512e', '#635bff', '#0891b2'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  },

  // Status badge HTML
  statusBadge(statut) {
    const config = {
      actif: { class: 'badge-success', icon: 'solar:record-circle-bold-duotone', label: 'Actif' },
      repos: { class: 'badge-info', icon: 'solar:moon-sleep-bold-duotone', label: 'Repos' },
      inactif: { class: 'badge-danger', icon: 'solar:record-circle-bold-duotone', label: 'Inactif' },
      suspendu: { class: 'badge-warning', icon: 'solar:record-circle-bold-duotone', label: 'Suspendu' },
      en_service: { class: 'badge-success', icon: 'solar:record-circle-bold-duotone', label: 'En service' },
      en_maintenance: { class: 'badge-warning', icon: 'solar:tuning-2-bold-duotone', label: 'Maintenance' },
      hors_service: { class: 'badge-danger', icon: 'solar:close-circle-bold-duotone', label: 'Hors service' },
      valide: { class: 'badge-success', icon: 'solar:check-circle-bold-duotone', label: 'Validé' },
      en_attente: { class: 'badge-warning', icon: 'solar:clock-circle-bold-duotone', label: 'En attente' },
      retard: { class: 'badge-danger', icon: 'solar:danger-triangle-bold-duotone', label: 'En retard' },
      partiel: { class: 'badge-info', icon: 'solar:pie-chart-2-bold-duotone', label: 'Partiel' },
      terminee: { class: 'badge-success', icon: 'solar:check-circle-bold-duotone', label: 'Terminée' },
      en_cours: { class: 'badge-info', icon: 'solar:refresh-bold', label: 'En cours' },
      annulee: { class: 'badge-danger', icon: 'solar:close-circle-bold', label: 'Annulée' },
      supprime: { class: 'badge-danger', icon: 'solar:trash-bin-trash-bold-duotone', label: 'Supprimé' },
      expire: { class: 'badge-danger', icon: 'solar:danger-circle-bold-duotone', label: 'Expiré' },
      a_renouveler: { class: 'badge-warning', icon: 'solar:danger-circle-bold-duotone', label: 'À renouveler' }
    };
    const c = config[statut] || { class: 'badge-neutral', icon: 'solar:record-circle-bold-duotone', label: statut };
    return `<span class="badge ${c.class}"><iconify-icon icon="${c.icon}" style="font-size:6px"></iconify-icon> ${c.label}</span>`;
  },

  // Photo-aware avatar HTML (returns <img> if photo exists, else colored initials circle)
  getAvatarHtml(chauffeur, sizeClass = '', style = '') {
    const initials = Utils.getInitials(chauffeur.prenom, chauffeur.nom);
    const color = Utils.getAvatarColor(chauffeur.id);
    const cls = `avatar${sizeClass ? ' ' + sizeClass : ''}`;
    if (chauffeur.photo) {
      return `<img src="${chauffeur.photo}" alt="${initials}" class="${cls}" style="object-fit:cover;${style}">`;
    }
    return `<div class="${cls}" style="background:${color};${style}">${initials}</div>`;
  },

  // Score class based on value
  scoreClass(score) {
    if (score >= 85) return 'score-excellent';
    if (score >= 70) return 'score-bon';
    if (score >= 55) return 'score-moyen';
    return 'score-faible';
  },

  // Score label
  scoreLabel(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Bon';
    if (score >= 55) return 'Moyen';
    return 'Faible';
  },

  // Clamp value between min and max
  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  // Random number between min and max
  random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Random float between min and max
  randomFloat(min, max, decimals = 1) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  },

  // Debounce function
  debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  // Export to CSV
  exportCSV(headers, rows, filename) {
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(';'),
      ...rows.map(row =>
        row.map(cell => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(';')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  },

  // Export to PDF (theme-aware)
  exportPDF(title, headers, rows, options = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF(options.orientation || 'landscape', 'mm', 'a4');
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Header
    doc.setFillColor(isDark ? 10 : 240, isDark ? 14 : 244, isDark ? 23 : 248);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 25, 'F');
    doc.setTextColor(59, 130, 246);
    doc.setFontSize(18);
    doc.text('PILOTE', 14, 16);
    doc.setTextColor(isDark ? 241 : 15, isDark ? 245 : 23, isDark ? 249 : 42);
    doc.setFontSize(12);
    doc.text(title, 44, 16);

    // Date
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 32);

    if (options.subtitle) {
      doc.text(options.subtitle, 14, 37);
    }

    // Table
    doc.autoTable({
      startY: options.subtitle ? 42 : 38,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: isDark ? [200, 200, 200] : [30, 41, 59],
        lineColor: isDark ? [30, 41, 59] : [226, 232, 240],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: isDark ? [17, 24, 39] : [241, 245, 249]
      },
      bodyStyles: {
        fillColor: isDark ? [15, 18, 30] : [255, 255, 255]
      }
    });

    doc.save(`pilote-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`);
  },

  // Get week number
  getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  },

  // Les n dernières semaines, la plus ancienne d'abord, du LUNDI au DIMANCHE.
  // debut / fin = 'AAAA-MM-JJ' (fin = dimanche inclus) pour comparer les dates
  // telles qu'elles sont stockées ; start / end = Date locales à minuit (end =
  // lundi suivant, exclu) ; label = numéro de semaine ISO (« S38 »).
  dernieresSemaines(n, ref) {
    const lundi = new Date(ref || Date.now());
    lundi.setHours(0, 0, 0, 0);
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    const cle = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const out = [];
    for (let w = n - 1; w >= 0; w--) {
      const start = new Date(lundi); start.setDate(start.getDate() - w * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      const dimanche = new Date(start); dimanche.setDate(dimanche.getDate() + 6);
      out.push({ label: `S${this.getWeekNumber(start)}`, start, end, debut: cle(start), fin: cle(dimanche) });
    }
    return out;
  },

  /**
   * État de paie d'un mois pour les chauffeurs salariés (gestion interne).
   *   salaire dû  = salaire mensuel × jours de contrat dans le mois / jours du mois
   *   prime       = prime mensuelle acquise (voir computePrimeMois), sauf si elle a
   *                 déjà été remise autrement qu'avec le salaire (espèces, Yango)
   *   net à payer = salaire dû + prime + ajustement − retenue
   * La retenue et l'ajustement sont des décisions de l'administrateur, lues dans
   * les lignes déjà enregistrées (`enregistrements`). La dette en cours n'est
   * JAMAIS retenue d'office : elle est seulement signalée.
   * Fonction pure.
   *
   * @param {string} mois 'AAAA-MM'
   */
  computePaieMois({ mois, chauffeurs, primes = [], primesVersees = [], dettesParChauffeur = {}, enregistrements = [], salaireDefaut = 250000, caJour = [], planning = [], aujourdhui = null }) {
    const [an, mo] = String(mois).split('-').map(Number);
    const joursMois = new Date(Date.UTC(an, mo, 0)).getUTCDate();
    const debutMois = `${mois}-01`, finMois = `${mois}-${String(joursMois).padStart(2, '0')}`;
    const jour = (iso) => Number(String(iso).slice(8, 10));
    const primeDe = new Map((primes || []).map(r => [r.chauffeurId, r]));
    const verseeDe = new Map((primesVersees || []).filter(b => b.semaine === mois && b.statut === 'verse').map(b => [b.chauffeurId, b]));
    const enregDe = new Map((enregistrements || []).filter(e => e.mois === mois).map(e => [e.chauffeurId, e]));

    // Activité réelle : jours roulés (CA > 0) et planifiés dans le mois, dernier jour roulé toutes périodes confondues.
    const roules = {}, planifies = {}, dernier = {};
    (caJour || []).forEach(e => {
      const id = e.chauffeurId || e.chauffeur_id, d = String(e.date || '').slice(0, 10);
      if (!id || !d || !((Number(e.caBrut ?? e.ca_brut) || 0) > 0)) return;
      if (!dernier[id] || d > dernier[id]) dernier[id] = d;
      if (d.slice(0, 7) === mois) (roules[id] = roules[id] || new Set()).add(d);
    });
    (planning || []).forEach(p => { const d = String(p.date || '').slice(0, 10); if (p.chauffeurId && d.slice(0, 7) === mois) (planifies[p.chauffeurId] = planifies[p.chauffeurId] || new Set()).add(d); });
    const ref = String(aujourdhui || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const moisEnCours = ref.slice(0, 7) === mois;
    const ecartJours = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

    return (chauffeurs || [])
      .filter(c => c.typeContrat === 'salarie')
      .map(ch => {
        const debut = String(ch.dateDebutContrat || '').slice(0, 10) || debutMois;
        const fin = String(ch.dateFinContrat || '').slice(0, 10) || finMois;
        const de = debut > debutMois ? debut : debutMois;
        const a = fin < finMois ? fin : finMois;
        const joursContrat = de <= a ? (jour(a) - jour(de) + 1) : 0;
        const enreg = enregDe.get(ch.id) || null;
        // Hors contrat ce mois-ci, ou parti et jamais payé : pas de ligne.
        if (!joursContrat || (ch.statut === 'inactif' && !ch.dateFinContrat && !enreg)) return null;

        const salaireBase = Number(ch.salaireMensuel) > 0 ? Number(ch.salaireMensuel) : salaireDefaut;
        const salaireDu = Math.round(salaireBase * joursContrat / joursMois);
        const p = primeDe.get(ch.id) || null;
        const versee = verseeDe.get(ch.id) || null;
        const primeAcquise = p ? (Number(p.montant) || 0) : 0;
        const primeHorsSalaire = !!(versee && versee.moyenVersement !== 'salaire');
        const prime = primeHorsSalaire ? 0 : (versee ? (Number(versee.montant) || 0) : primeAcquise);
        const retenue = enreg ? (Number(enreg.retenue) || 0) : 0;
        const ajustement = enreg ? (Number(enreg.ajustement) || 0) : 0;
        const paye = !!(enreg && enreg.statut === 'paye');
        // Une ligne payée est figée : on relit ce qui a été payé, pas ce qu'on recalcule.
        const fige = paye ? { salaireDu: Number(enreg.salaireDu) || 0, prime: Number(enreg.prime) || 0, net: Number(enreg.net) || 0 } : null;
        return {
          chauffeurId: ch.id, nom: `${ch.prenom || ''} ${ch.nom || ''}`.trim(), mois,
          salaireBase, joursContrat, joursMois, complet: joursContrat === joursMois,
          salaireDu: fige ? fige.salaireDu : salaireDu,
          prime: fige ? fige.prime : prime,
          primeInfo: primeHorsSalaire ? `Prime de ${this.formatCurrency(versee.montant || 0)} déjà remise (${versee.moyenVersement === 'yango' ? 'solde Yango' : 'espèces'})`
            : (p && p.bloque ? p.raison : (p && !p.acquise && p.joursPlanifies > 0 ? `Objectif atteint à ${p.taux} %` : (p && p.joursPlanifies === 0 ? 'Aucun jour planifié' : ''))),
          dette: Math.round(dettesParChauffeur[ch.id] || 0),
          joursRoules: (roules[ch.id] || new Set()).size, joursPlanifies: (planifies[ch.id] || new Set()).size,
          dernierJourRoule: dernier[ch.id] || null,
          // Sous contrat, réputé actif, mais sans aucune course depuis N jours (mois en cours seulement)
          joursSansActivite: (moisEnCours && ch.statut !== 'inactif' && dernier[ch.id]) ? ecartJours(dernier[ch.id], ref) : null,
          jamaisRoule: moisEnCours && ch.statut !== 'inactif' && !dernier[ch.id],
          // vrai si le chauffeur, réputé actif, n'a aucune course depuis plus de 7 jours (ou jamais) — mois en cours seulement
          sansActivite: moisEnCours && ch.statut !== 'inactif' && (!dernier[ch.id] || ecartJours(dernier[ch.id], ref) > 7),
          primeFragile: !!(p && p.fragile && prime > 0),
          retenue, ajustement, motif: enreg ? (enreg.motif || '') : '',
          net: fige ? fige.net : (salaireDu + prime + ajustement - retenue),
          paye, payeLe: enreg ? enreg.payeLe : null, moyenPaiement: enreg ? enreg.moyenPaiement : null, referencePaiement: enreg ? enreg.referencePaiement : null,
          enregistrementId: enreg ? enreg.id : null
        };
      })
      .filter(Boolean)
      .sort((x, y) => x.nom.localeCompare(y.nom));
  },

  /**
   * Couverture des voitures : pour chaque date, combien de voitures en service
   * ont un chauffeur planifié, et combien de postes (voiture × vague) sont tenus.
   * Une voiture à l'arrêt ne rapporte rien : c'est le premier chiffre à regarder.
   *
   *   dates      ['AAAA-MM-JJ', …]
   *   renvoie    { nbVoitures, postesParJour, jours: [{ date, voitures, arret, postes, vague1, vague2, chauffeurs }] }
   *
   * Un créneau compte s'il concerne un chauffeur non inactif et non absent ce
   * jour-là. Sa voiture = celle du créneau, sinon celle du chauffeur ; sa vague
   * = typeCreneaux (« vague1 » / « vague2 ») ou service (« jour » / « nuit »).
   */
  couvertureFlotte({ vehicules, chauffeurs, planning, absences, dates }) {
    const enService = (vehicules || []).filter(v => v.statut === 'en_service');
    const idsVoitures = new Set(enService.map(v => v.id));
    const chParId = new Map((chauffeurs || []).map(c => [c.id, c]));
    const nb = enService.length;
    const jours = (dates || []).map(date => {
      const voitures = new Set(), postes = new Set(), chauffeursVus = new Set();
      let vague1 = 0, vague2 = 0;
      (planning || []).forEach(p => {
        if (p.date !== date) return;
        const ch = chParId.get(p.chauffeurId);
        if (!ch || ch.statut === 'inactif' || chauffeursVus.has(p.chauffeurId)) return;
        const absent = (absences || []).some(a => a.chauffeurId === p.chauffeurId && date >= a.dateDebut && date <= a.dateFin);
        if (absent) return;
        chauffeursVus.add(p.chauffeurId);
        let voiture = p.vehiculeId || ch.vehiculeAssigne || '';
        if (!idsVoitures.has(voiture)) voiture = 'sans-voiture-' + p.chauffeurId;
        const vague = (p.typeCreneaux === 'vague2' || p.service === 'nuit') ? 2 : ((p.typeCreneaux === 'vague1' || p.service === 'jour') ? 1 : 0);
        voitures.add(voiture);
        postes.add(voiture + '|' + (vague || p.chauffeurId));
        if (vague === 1) vague1++; else if (vague === 2) vague2++;
      });
      const nbVoitures = Math.min(nb, voitures.size);
      return { date, voitures: nbVoitures, arret: Math.max(0, nb - nbVoitures), postes: Math.min(nb * 2, postes.size), vague1: Math.min(nb, vague1), vague2: Math.min(nb, vague2), chauffeurs: chauffeursVus.size };
    });
    return { nbVoitures: nb, postesParJour: nb * 2, jours };
  },

  // Get month name in French
  getMonthName(monthIndex) {
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return months[monthIndex];
  },

  // Get short month name
  getMonthShort(monthIndex) {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
      'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    return months[monthIndex];
  },

  /**
   * Returns the chart segment border color matching the card background.
   * In dark mode: #111827, in light mode: #ffffff.
   */
  chartBorderColor() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark ? '#111827' : '#ffffff';
  },

  // Chart.js theme-aware defaults
  configureChartDefaults() {
    if (typeof Chart === 'undefined') return;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
    Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.font.weight = 500;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
    Chart.defaults.plugins.legend.labels.padding = 18;
    Chart.defaults.plugins.legend.labels.font = { size: 12, weight: 500 };
    Chart.defaults.plugins.tooltip.backgroundColor = isDark ? 'rgba(15,23,42,.95)' : 'rgba(255,255,255,.97)';
    Chart.defaults.plugins.tooltip.titleColor = isDark ? '#f1f5f9' : '#111827';
    Chart.defaults.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#4b5563';
    Chart.defaults.plugins.tooltip.borderColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 12;
    Chart.defaults.plugins.tooltip.padding = 14;
    Chart.defaults.plugins.tooltip.displayColors = true;
    Chart.defaults.plugins.tooltip.boxPadding = 6;
    Chart.defaults.plugins.tooltip.titleFont = { size: 13, weight: 700 };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
    Chart.defaults.plugins.tooltip.caretSize = 6;
    Chart.defaults.plugins.tooltip.caretPadding = 8;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 6;
    Chart.defaults.elements.point.borderWidth = 2;
    Chart.defaults.elements.point.hoverBorderWidth = 2;
    Chart.defaults.elements.line.tension = 0.4;
    Chart.defaults.elements.line.borderWidth = 2.5;
    Chart.defaults.elements.bar.borderRadius = 8;
    Chart.defaults.elements.bar.borderSkipped = false;
    Chart.defaults.scale.grid = { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)', drawBorder: false };
    Chart.defaults.scale.border = { display: false };
    Chart.defaults.scale.ticks = { ...Chart.defaults.scale.ticks, padding: 8 };

    // Animation d'entrée
    Chart.defaults.animation = {
      duration: 900,
      easing: 'easeOutQuart'
    };

  },

  // =================== CHART VISUAL HELPERS ===================

  /**
   * Custom doughnut center text plugin
   * @param {string|Function} text - Main text or function returning text
   * @param {string|Function} subText - Sub text or function returning text
   * @returns {object} Chart.js plugin
   */
  doughnutCenterPlugin(text, subText) {
    return {
      id: 'doughnutCenter_' + Math.random().toString(36).slice(2, 8),
      afterDraw(chart) {
        const { ctx, width, height } = chart;
        // Only draw for doughnut/pie
        if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;

        const displayText = typeof text === 'function' ? text(chart) : text;
        const displaySub = typeof subText === 'function' ? subText(chart) : subText;

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data[0]) return;

        // Calculate center of the doughnut
        const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
        const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Main text
        ctx.font = 'bold 22px Inter';
        ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
        ctx.fillText(displayText, centerX, centerY - 8);

        // Sub text
        ctx.font = '11px Inter';
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.fillText(displaySub, centerX, centerY + 14);

        ctx.restore();
      }
    };
  },

  // =================== DATE HELPERS ===================

  /** Get today's date as ISO string (YYYY-MM-DD) */
  todayISO(date) {
    const d = date || new Date();
    return d.toISOString().split('T')[0];
  },

  /** Check if dateStr matches a given month/year */
  matchesMonth(dateStr, month, year) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === month && d.getFullYear() === year;
  },

  // =================== DEBT HELPERS ===================

  /** Detect if a versement is linked to a contravention */
  isContravention(v) {
    return v.source === 'contravention' || (v.reference && v.reference.startsWith('CTR')) || (v.commentaire && v.commentaire.toLowerCase().includes('contravention'));
  },

  /**
   * Compute all debts (explicit + implicit + contraventions).
   * Uses indexed lookups for performance (O(n) instead of O(n²)).
   * @param {Object} opts - { versements, chauffeurs, planning, absences, contraventions }
   * @returns {Object} { totalDettesRecettes, totalDettesContraventions, totalDettes, nbDetteDrivers, detteList, ... }
   */


  // =================== SIMULATEUR DE PLANIFICATION ===================

  /** Noms des jours, index = Date.getDay() (0 = dimanche). */
  JOURS_SEMAINE: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],

  /**
   * Jour de repos hebdomadaire d'un chauffeur (0 = dimanche … 6 = samedi), ou
   * null s'il n'est pas défini. Règle en vigueur depuis le 16/09/2026 : chaque
   * chauffeur a UN jour de repos par semaine (l'ancien 2e jour des salariés
   * n'est plus lu).
   */
  jourReposDe(ch) {
    if (!ch) return null;
    const j = ch.jourRepos;
    if (j === null || j === undefined || j === '') return null;
    const n = Number(j);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
  },

  /**
   * Vérifie qu'un créneau laisse au chauffeur au moins un jour libre dans la
   * semaine (lundi → dimanche) qui contient `dateStr`.
   *   planning   : créneaux existants (ceux du Store, éventuellement complétés
   *                par des créneaux simulés) ;
   *   ignorerId  : créneau à exclure du décompte (celui qu'on déplace ou modifie).
   * Renvoie { ok, joursTravailles, estJourRepos, jourRepos, lundi }.
   */
  controleReposHebdo(chauffeur, dateStr, planning, ignorerId) {
    const id = chauffeur && chauffeur.id;
    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    if (!id || !y || !m || !d) return { ok: true, joursTravailles: 0, estJourRepos: false, jourRepos: null, lundi: null };
    const jour = new Date(y, m - 1, d);
    const dow = jour.getDay();
    const lundi = new Date(y, m - 1, d - (dow === 0 ? 6 : dow - 1));
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const debut = iso(lundi);
    const fin = iso(new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 6));
    const jours = new Set([dateStr]);
    (planning || []).forEach(p => {
      if (!p || p.chauffeurId !== id || (ignorerId && p.id === ignorerId)) return;
      if (p.date >= debut && p.date <= fin) jours.add(p.date);
    });
    const jourRepos = this.jourReposDe(chauffeur);
    return { ok: jours.size < 7, joursTravailles: jours.size, estJourRepos: jourRepos === dow, jourRepos, lundi: debut };
  },

  /** Message affiché quand un créneau priverait un chauffeur de son jour de repos. */
  messageReposHebdo(chauffeur) {
    const nom = (chauffeur ? `${chauffeur.prenom || ''} ${chauffeur.nom || ''}`.trim() : '') || 'Ce chauffeur';
    return `${nom} travaillerait 7 jours sur 7 cette semaine : un jour de repos par semaine est obligatoire.`;
  },
  /**
   * Préférence d'attribution des jours de repos proposés : du lundi au jeudi
   * d'abord, puis dimanche, vendredi et samedi (les jours les plus rentables
   * restent travaillés par les titulaires).
   */
  ORDRE_JOURS_REPOS: [1, 2, 3, 4, 0, 5, 6],

  /**
   * Propose un jour de repos aux chauffeurs qui n'en ont pas, en étalant les
   * repos des titulaires sur la semaine (moins de repos le même jour = moins
   * d'intérimaires nécessaires). Les intérimaires se reposent de préférence le
   * jour où le moins de titulaires sont au repos, puisqu'on a alors le moins
   * besoin d'eux.
   *   titulaires / interimaires : fiches chauffeurs (id, jourRepos)
   * Renvoie { [chauffeurId]: jour } pour les seules fiches sans jour défini.
   */
  proposerJoursRepos(titulaires, interimaires) {
    const charge = [0, 0, 0, 0, 0, 0, 0];
    const propositions = {};
    const moinsCharge = () => this.ORDRE_JOURS_REPOS.reduce((best, j) => (charge[j] < charge[best] ? j : best), this.ORDRE_JOURS_REPOS[0]);
    (titulaires || []).forEach(c => { const j = this.jourReposDe(c); if (j !== null) charge[j]++; });
    (titulaires || []).forEach(c => {
      if (this.jourReposDe(c) !== null) return;
      const j = moinsCharge();
      propositions[c.id] = j;
      charge[j]++;
    });
    // Intérimaires : on étale aussi leurs repos entre eux.
    const chargeInterim = [0, 0, 0, 0, 0, 0, 0];
    (interimaires || []).forEach(c => { const j = this.jourReposDe(c); if (j !== null) chargeInterim[j]++; });
    (interimaires || []).forEach(c => {
      if (this.jourReposDe(c) !== null) return;
      const j = this.ORDRE_JOURS_REPOS.reduce((best, k) => {
        const a = charge[k] + chargeInterim[k] * 10, b = charge[best] + chargeInterim[best] * 10;
        return a < b ? k : best;
      }, this.ORDRE_JOURS_REPOS[0]);
      propositions[c.id] = j;
      chargeInterim[j]++;
    });
    return propositions;
  },

  /**
   * Emploi du temps automatique sur une période.
   *
   * Règles :
   *  - chaque poste (voiture × vague) est tenu par son titulaire ;
   *  - le jour de repos du titulaire (ou son absence), un intérimaire le remplace ;
   *  - personne ne travaille le jour de son repos, ni deux postes le même jour,
   *    ni plus de 6 jours dans une semaine du lundi au dimanche ;
   *  - les intérimaires sont répartis équitablement (le moins chargé d'abord,
   *    puis celui qui tenait déjà ce poste) ;
   *  - un créneau déjà saisi n'est jamais modifié : le poste est considéré couvert
   *    et son chauffeur occupé ce jour-là.
   *
   * params :
   *   dates          ['YYYY-MM-DD', …] dans l'ordre
   *   postes         [{ cle, vehiculeId, service, typeCreneaux, heureDebut, heureFin, titulaireId }]
   *   chauffeurs     fiches (id, prenom, nom, jourRepos)
   *   interimaireIds ids des intérimaires utilisables
   *   reposProposes  { chauffeurId: jour } pour les fiches sans jour défini
   *   existants      { postesCouverts: Set('vehiculeId|date|service'), creneaux: [{ chauffeurId, date }] }
   *   absences       [{ chauffeurId, dateDebut, dateFin }]
   * Renvoie { grille: { [cle]: { [date]: cellule } }, creneaux, stats }.
   *   cellule.type : 'existant' | 'titulaire' | 'interimaire' | 'manque'
   */
  construireEmploiDuTemps({ dates, postes, chauffeurs, interimaireIds, reposProposes, existants, absences }) {
    const chById = {};
    (chauffeurs || []).forEach(c => { chById[c.id] = c; });
    const repos = (id) => {
      const j = this.jourReposDe(chById[id]);
      if (j !== null) return j;
      return reposProposes && reposProposes[id] !== undefined ? Number(reposProposes[id]) : null;
    };
    const lundiDe = (date) => {
      const [y, m, d] = date.split('-').map(Number);
      const x = new Date(y, m - 1, d);
      const dow = x.getDay();
      const l = new Date(y, m - 1, d - (dow === 0 ? 6 : dow - 1));
      return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, '0')}-${String(l.getDate()).padStart(2, '0')}`;
    };
    const dowDe = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };

    // Jours déjà occupés, par chauffeur et par semaine.
    const occupe = {};          // `${id}|${date}` → true
    const semaine = {};         // `${id}|${lundi}` → Set(dates)
    const charge = {};          // id → nb de jours sur la période
    const marquer = (id, date, compter) => {
      occupe[`${id}|${date}`] = true;
      const k = `${id}|${lundiDe(date)}`;
      (semaine[k] = semaine[k] || new Set()).add(date);
      if (compter) charge[id] = (charge[id] || 0) + 1;
    };
    const debutPeriode = dates[0], finPeriode = dates[dates.length - 1];
    ((existants && existants.creneaux) || []).forEach(p => {
      if (!p || !p.chauffeurId || !p.date) return;
      marquer(p.chauffeurId, p.date, p.date >= debutPeriode && p.date <= finPeriode);
    });
    const couverts = (existants && existants.postesCouverts) || new Set();
    const absent = (id, date) => (absences || []).some(a => a.chauffeurId === id && a.dateDebut <= date && a.dateFin >= date);
    const disponible = (id, date) => {
      if (!id || occupe[`${id}|${date}`]) return false;
      if (repos(id) === dowDe(date)) return false;
      if (absent(id, date)) return false;
      const k = `${id}|${lundiDe(date)}`;
      return !semaine[k] || semaine[k].size < 6;
    };

    const interims = (interimaireIds || []).filter(id => chById[id]);
    const dernierSurPoste = {};   // cle → id de l'intérimaire qui l'a tenu en dernier
    const grille = {};
    const creneaux = [];
    const stats = { titulaire: 0, interimaire: 0, existant: 0, manque: 0, manqueParJour: {}, parInterimaire: {} };
    postes.forEach(po => { grille[po.cle] = {}; });

    dates.forEach(date => {
      postes.forEach(po => {
        if (couverts.has(`${po.vehiculeId}|${date}|${po.service}`)) {
          grille[po.cle][date] = { type: 'existant' };
          stats.existant++;
          return;
        }
        const t = po.titulaireId;
        if (t && disponible(t, date)) {
          marquer(t, date, true);
          grille[po.cle][date] = { type: 'titulaire', chauffeurId: t };
          creneaux.push({ poste: po, date, chauffeurId: t, role: 'titulaire' });
          stats.titulaire++;
          return;
        }
        const motif = !t ? 'sans_titulaire' : (repos(t) === dowDe(date) ? 'repos' : (absent(t, date) ? 'absence' : 'occupe'));
        const candidats = interims.filter(id => id !== t && disponible(id, date));
        if (!candidats.length) {
          grille[po.cle][date] = { type: 'manque', motif, remplaceId: t || null };
          stats.manque++;
          stats.manqueParJour[date] = (stats.manqueParJour[date] || 0) + 1;
          return;
        }
        candidats.sort((a, b) => (charge[a] || 0) - (charge[b] || 0) || ((dernierSurPoste[po.cle] === b) - (dernierSurPoste[po.cle] === a)));
        const i = candidats[0];
        marquer(i, date, true);
        dernierSurPoste[po.cle] = i;
        grille[po.cle][date] = { type: 'interimaire', chauffeurId: i, motif, remplaceId: t || null };
        creneaux.push({ poste: po, date, chauffeurId: i, role: 'doublure', motif, remplaceId: t || null });
        stats.interimaire++;
        stats.parInterimaire[i] = (stats.parInterimaire[i] || 0) + 1;
      });
    });
    stats.interimairesManquants = Object.values(stats.manqueParJour).reduce((m, n) => Math.max(m, n), 0);
    return { grille, creneaux, stats };
  },

  /** Plus longue serie de jours consecutifs travailles (liste non triee acceptee). */
  maxJoursConsecutifs(jours) {
    let max = 0, courant = 0, precedent = -99;
    [...(jours || [])].sort((a, b) => a - b).forEach(j => {
      courant = (j === precedent + 1) ? courant + 1 : 1;
      precedent = j;
      if (courant > max) max = courant;
    });
    return max;
  },

  /**
   * Projection financiere du mois simule, du chiffre d'affaires au benefice net.
   * En doublure locataire, le CA de ses journees lui appartient : seule sa
   * recette entre dans vos produits.
   */
  simulerFinanceMois(p) {
    const nbV = p.nbVehicules || 0;
    const joursCA = p.doublureSalariee ? (p.joursTitulaires + p.joursDoublures) : p.joursTitulaires;
    const joursEnergie = joursCA;
    const caBrut = joursCA * (p.objectifCA || 0);
    const commission = caBrut * (p.commission || 0) / 100;
    const caNet = caBrut - commission;
    const recettesDoublures = p.doublureSalariee ? 0 : p.joursDoublures * (p.recetteDoublure || 0);
    const nbSalaries = nbV + (p.doublureSalariee ? (p.nbDoublures || 0) : 0);
    const masse = nbSalaries * (p.salaire || 0) * (1 + (p.charges || 0) / 100);
    const coutEnergie = joursEnergie * (p.energie || 0);
    const coutFixe = nbV * ((p.entretien || 0) + (p.location || 0));
    const exploitation = caNet + recettesDoublures - masse - coutEnergie - coutFixe;

    const bonus = nbSalaries * (p.bonusHebdo || 0) * 4.33;
    const provisions = nbV * (p.provision || 0);
    const avantImpot = exploitation - (p.fraisStructure || 0) - bonus - provisions;
    const impot = avantImpot > 0 ? avantImpot * (p.tauxImpot || 0) / 100 : 0;
    const net = avantImpot - impot;

    // Reference : modele location actuel (recette fixe, ni salaire ni energie a votre charge)
    const referenceExploitation = (p.refJours || 0) * (p.refRecette || 0) - nbV * (p.location || 0);
    const denominateur = joursCA * (1 - (p.commission || 0) / 100);
    const seuilCA = denominateur > 0
      ? (referenceExploitation + masse + coutEnergie + coutFixe - recettesDoublures) / denominateur
      : 0;

    return { joursCA, caBrut, commission, caNet, recettesDoublures, masse, coutEnergie, coutFixe,
             exploitation, bonus, provisions, avantImpot, impot, net, nbSalaries,
             referenceExploitation, ecart: exploitation - referenceExploitation, seuilCA };
  },

  // =================== MOTEUR DE BONUS HEBDOMADAIRE ===================

  /** Règles par défaut, surchargeables via Paramètres (settings.bonus). */
  bonusReglesParDefaut() {
    return {
      // Location : on récompense la RECETTE VERSÉE, pas le volume de courses.
      // (le CA ne rapporte que 3 % au parc : payer un bonus dessus serait perdant)
      location: {
        actif: true,
        montantSemaineComplete: 7500,   // toutes les recettes de la semaine versées
        montantQualite: 2500,           // score de conduite au-dessus du seuil
        seuilQualite: 80,
        bloqueSiDette: true             // une dette en cours retient le bonus
      },
      // Salarié : le salaire fixe supprime la motivation, le bonus la recrée.
      // Paliers sur le CA hebdomadaire (6 jours × objectif journalier).
      salarie: {
        actif: true,
        paliers: [
          { caMin: 420000, montant: 15000 },
          { caMin: 480000, montant: 30000 },
          { caMin: 540000, montant: 50000 }
        ],
        seuilQualite: 80,
        montantQualite: 0
      },
      plafondHebdo: 50000
    };
  },

  /** Lundi de la semaine contenant `date` (les semaines vont du lundi au dimanche). */
  lundiDeLaSemaine(date) {
    const d = new Date(date);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  },

  /**
   * Calcule le bonus de la semaine pour chaque chauffeur.
   * Fonction pure : toutes les données sont passées en paramètres.
   *
   * @param {string} lundi        date du lundi (YYYY-MM-DD)
   * @param {object} caParChauffeur  { chauffeurId: caSemaine } — requis pour les salariés
   * @param {object} dettesParChauffeur { chauffeurId: montantDette }
   */
  /**
   * Prime mensuelle des chauffeurs salariés (modèle deux vagues, 14/09/2026).
   * Objectif du mois = objectif par vague × jours planifiés du mois.
   * La prime est acquise si le CA brut Yango du mois atteint cet objectif.
   * Fonction pure : toutes les données sont passées en paramètres.
   *
   * @param {string} mois   'YYYY-MM'
   */
  computePrimeMois({ mois, chauffeurs, planning, caJour = [], objectifs = {}, dettesParChauffeur = {} }) {
    const objParVague = Number(objectifs.caJourChauffeur) > 0 ? Number(objectifs.caJourChauffeur) : 60000;
    const montantPrime = Number(objectifs.primeMensuelle) > 0 ? Number(objectifs.primeMensuelle) : 100000;
    const primeActive = objectifs.primeActive !== false;
    const dansLeMois = (d) => String(d || '').slice(0, 7) === mois;

    // CA brut Yango du mois, par chauffeur
    const caParChauffeur = {};
    (caJour || []).forEach(e => {
      if (!dansLeMois(e.date)) return;
      const id = e.chauffeurId || e.chauffeur_id;
      if (!id) return;
      caParChauffeur[id] = (caParChauffeur[id] || 0) + (Number(e.caBrut ?? e.ca_brut) || 0);
    });

    // Jours réellement roulés (CA > 0) dans le mois, par chauffeur. La règle ne
    // s'en sert pas — l'objectif reste calculé sur les jours PLANIFIÉS — mais on
    // le montre : un chauffeur qui roule hors planning gonfle son CA sans que
    // son objectif bouge, et décroche la prime plus facilement qu'il ne devrait.
    const roulesParChauffeur = {};
    (caJour || []).forEach(e => {
      if (!dansLeMois(e.date) || !((Number(e.caBrut ?? e.ca_brut) || 0) > 0)) return;
      const id = e.chauffeurId || e.chauffeur_id;
      if (!id) return;
      (roulesParChauffeur[id] = roulesParChauffeur[id] || new Set()).add(String(e.date).slice(0, 10));
    });

    // Jours distincts planifiés dans le mois, par chauffeur
    const joursParChauffeur = {};
    (planning || []).forEach(p => {
      if (!dansLeMois(p.date) || !p.chauffeurId) return;
      (joursParChauffeur[p.chauffeurId] = joursParChauffeur[p.chauffeurId] || new Set()).add(String(p.date).slice(0, 10));
    });

    return (chauffeurs || [])
      .filter(c => c.statut !== 'inactif' && c.typeContrat === 'salarie')
      .map(ch => {
        const joursPlanifies = (joursParChauffeur[ch.id] || new Set()).size;
        const caMois = Math.round(caParChauffeur[ch.id] || 0);
        const objectifMois = objParVague * joursPlanifies;
        const joursRoules = (roulesParChauffeur[ch.id] || new Set()).size;
        const objectifSiRoules = objParVague * Math.max(joursPlanifies, joursRoules);
        const taux = objectifMois > 0 ? Math.round((caMois / objectifMois) * 100) : 0;
        const dette = dettesParChauffeur[ch.id] || 0;
        let montant = 0, bloque = false, raison = '';
        if (!primeActive) { bloque = true; raison = 'Prime désactivée dans les réglages'; }
        else if (joursPlanifies === 0) { raison = 'Aucun jour planifié ce mois'; }
        else if (caMois >= objectifMois) {
          if (dette > 0) { bloque = true; raison = `Objectif atteint mais ${this.formatCurrency(dette)} de dette en cours`; }
          else montant = montantPrime;
        } else {
          raison = `Il manque ${this.formatCurrency(objectifMois - caMois)}`;
        }
        return {
          chauffeurId: ch.id, nom: `${ch.prenom} ${ch.nom}`.trim(), mois,
          joursPlanifies, joursRoules, caMois, objectifMois, objectifSiRoules, objParVague, taux, dette,
          // « fragile » : acquise seulement parce que le planning compte moins de jours que ceux réellement roulés
          fragile: joursPlanifies > 0 && caMois >= objectifMois && caMois < objectifSiRoules,
          montant, acquise: caMois >= objectifMois && joursPlanifies > 0, bloque, raison
        };
      })
      .sort((a, b) => b.taux - a.taux);
  },

  computeBonusSemaine({ lundi, chauffeurs, planning, versements, caParChauffeur = {}, dettesParChauffeur = {}, regles }) {
    const R = regles || this.bonusReglesParDefaut();
    const jours = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lundi);
      d.setDate(d.getDate() + i);
      jours.push(this.todayISO(d));
    }
    const dimanche = jours[6];

    // Recettes versées par chauffeur et par date (les 'supprime' comptent comme réglées)
    const verseParCle = {};
    (versements || []).forEach(v => {
      if (!v.chauffeurId || !v.date) return;
      if (v.statut === 'supprime') return;
      const cle = `${v.chauffeurId}|${v.date}`;
      verseParCle[cle] = (verseParCle[cle] || 0) + (v.montantVerse || 0);
    });

    return (chauffeurs || [])
      .filter(c => c.statut !== 'inactif')
      .map(ch => {
        const estSalarie = ch.typeContrat === 'salarie';
        const criteres = [];
        let montant = 0;
        let bloque = false;
        let raison = '';

        const creneaux = (planning || []).filter(p => p.chauffeurId === ch.id && jours.includes(p.date));
        const dette = dettesParChauffeur[ch.id] || 0;

        if (estSalarie) {
          const cfg = R.salarie;
          const caSemaine = caParChauffeur[ch.id] || 0;
          const atteint = (cfg.paliers || [])
            .filter(p => caSemaine >= p.caMin)
            .sort((a, b) => b.montant - a.montant)[0];
          if (!cfg.actif) { bloque = true; raison = 'Bonus salarié désactivé'; }
          else if (atteint) {
            montant = atteint.montant;
            criteres.push(`CA hebdomadaire ${this.formatCurrency(caSemaine)} — palier ${this.formatCurrency(atteint.caMin)}`);
          } else {
            raison = `CA de ${this.formatCurrency(caSemaine)} — sous le premier palier`;
          }
          return { chauffeurId: ch.id, nom: `${ch.prenom} ${ch.nom}`, typeContrat: 'salarie',
                   semaine: lundi, montant, criteres, bloque, raison,
                   base: { caSemaine, joursPlanifies: creneaux.length } };
        }

        // --- Chauffeur en location ---
        const cfg = R.location;
        let joursDus = 0, joursPayes = 0, totalDu = 0, totalVerse = 0;
        creneaux.forEach(p => {
          const attendu = (p.redevanceOverride != null && p.redevanceOverride > 0)
            ? p.redevanceOverride : (ch.redevanceQuotidienne || 0);
          if (attendu <= 0) return;
          joursDus++;
          totalDu += attendu;
          const paye = verseParCle[`${ch.id}|${p.date}`] || 0;
          totalVerse += paye;
          if (paye >= attendu) joursPayes++;
        });

        if (!cfg.actif) { bloque = true; raison = 'Bonus location désactivé'; }
        else if (joursDus === 0) { raison = 'Aucun créneau programmé cette semaine'; }
        else if (joursPayes < joursDus) {
          raison = `${joursPayes}/${joursDus} recettes versées`;
        } else {
          montant += cfg.montantSemaineComplete;
          criteres.push(`${joursPayes}/${joursDus} recettes versées intégralement`);
          const score = ch.scoreConduite || 0;
          if (cfg.montantQualite > 0 && score >= cfg.seuilQualite) {
            montant += cfg.montantQualite;
            criteres.push(`Score de conduite ${score}/100`);
          }
        }

        if (montant > 0 && cfg.bloqueSiDette && dette > 0) {
          bloque = true;
          raison = `Dette en cours de ${this.formatCurrency(dette)} — le bonus la solde d'abord`;
        }

        if (montant > (R.plafondHebdo || Infinity)) montant = R.plafondHebdo;

        return { chauffeurId: ch.id, nom: `${ch.prenom} ${ch.nom}`, typeContrat: 'location',
                 semaine: lundi, montant, criteres, bloque, raison,
                 base: { joursDus, joursPayes, totalDu, totalVerse, dette } };
      })
      .filter(b => b.montant > 0 || b.base.joursDus > 0 || b.base.caSemaine > 0)
      .sort((a, b) => b.montant - a.montant);
  },

  // ===== LOCATION : montant dû par jour planifié = base + taux Yango × CA brut =====
  // Règle du 10/09/2026 : 35 000 F + 23 % du CA Yango brut du jour (le locataire
  // supporte la commission Yango en plus du loyer). Base et taux sont des réglages
  // de flotte (Paramètres › Préférences : locationRedevance, locationTauxYango en %) ;
  // l'override du planning puis la redevance du chauffeur remplacent la base.
  // Tant que le CA du jour n'est pas synchronisé, la part Yango vaut 0 et se
  // corrige d'elle-même à la synchro. Un salarié n'est JAMAIS concerné (CA net).
  locationParams(settings) {
    let s = settings;
    if (!s && typeof Store !== 'undefined' && Store.get) { try { s = Store.get('settings'); } catch (e) { s = null; } }
    const p = (s && s.preferences) || {};
    const base = Number(p.locationRedevance);
    const tauxPct = Number(p.locationTauxYango);
    return {
      base: (isFinite(base) && base > 0) ? base : 35000,
      taux: (isFinite(tauxPct) && tauxPct >= 0) ? tauxPct / 100 : 0.23
    };
  },

  // ch = chauffeur, p = entrée de planning (peut être null), caBrut = CA Yango brut
  // du jour (null = non synchronisé). Renvoie { du, base, taux, caBrut, partYango, caSync }.
  montantDuLocation(ch, p, caBrut, settings) {
    const { base, taux } = this.locationParams(settings);
    const override = (p && p.redevanceOverride != null && Number(p.redevanceOverride) > 0) ? Number(p.redevanceOverride) : 0;
    const perso = (ch && Number(ch.redevanceQuotidienne) > 0) ? Number(ch.redevanceQuotidienne) : 0;
    const baseEff = override || perso || base;
    const caSync = caBrut != null && !isNaN(Number(caBrut));
    const ca = caSync ? Math.max(0, Number(caBrut)) : 0;
    const partYango = Math.round(ca * taux);
    return { du: Math.round(baseEff + partYango), base: baseEff, taux, caBrut: ca, partYango, caSync };
  },

  computeDebts({ versements, chauffeurs, planning, absences, contraventions, caJour = [], charges = [] }) {
    const todayStr = this.todayISO();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = this.todayISO(thirtyDaysAgo);

    // Build lookup indexes for O(1) access
    const chauffeurById = new Map(chauffeurs.map(c => [c.id, c]));
    // Versement lookup by "chauffeurId|date" for payment checks
    const paymentIndex = new Set();
    versements.forEach(v => {
      if (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte' || v.statut === 'partiel' || v.traitementManquant === 'perte') {
        paymentIndex.add(`${v.chauffeurId}|${v.date}`);
      }
    });
    // Absence lookup by chauffeurId
    const absencesByDriver = new Map();
    absences.forEach(a => {
      if (!absencesByDriver.has(a.chauffeurId)) absencesByDriver.set(a.chauffeurId, []);
      absencesByDriver.get(a.chauffeurId).push(a);
    });
    const hasAbsence = (chauffeurId, date) => {
      const driverAbsences = absencesByDriver.get(chauffeurId);
      if (!driverAbsences) return false;
      return driverAbsences.some(a => date >= a.dateDebut && date <= a.dateFin);
    };

    // Pour les salaries, le du est variable (CA brut - charges) : il faut le
    // MONTANT verse, pas seulement savoir s'il y a eu un versement.
    const versementSumIndex = new Map();
    versements.forEach(v => {
      if (v.statut === 'valide' || v.statut === 'partiel') {
        const k = `${v.chauffeurId}|${v.date}`;
        versementSumIndex.set(k, (versementSumIndex.get(k) || 0) + (Number(v.montantVerse) || 0));
      }
    });
    // Annulation d'une dette salariee : un versement « supprime » (bouton
    // Annuler) ou un traitement « perte » neutralise le jour entier.
    const annulationIndex = new Set();
    versements.forEach(v => {
      if (v.statut === 'supprime' || v.traitementManquant === 'perte') {
        annulationIndex.add(`${v.chauffeurId}|${v.date}`);
      }
    });
    // CA brut Yango par chauffeur et par jour (source du du salarie).
    const caIndex = new Map();
    (caJour || []).forEach(e => { caIndex.set(`${e.chauffeurId}|${e.date}`, Number(e.caBrut) || 0); });
    // Charges saisies (recharge, lavage, autres), sommees par chauffeur et jour.
    const chargesIndex = new Map();
    (charges || []).forEach(c => {
      const k = `${c.chauffeurId}|${c.date}`;
      chargesIndex.set(k, (chargesIndex.get(k) || 0) + (Number(c.montant) || 0));
    });

    // 1. Explicit debts
    // The contraventions table is the single source of truth for contravention debts
    // (to keep /versements aligned with /controle-conduite and /contraventions KPIs).
    // Versements flagged as contravention-sourced are intentionally ignored here —
    // they would double-count or diverge from the contraventions table.
    const allDetteVersements = versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0);
    const dettesExplicites = allDetteVersements
      .filter(v => !this.isContravention(v))
      .map(v => ({ ...v, source: v.source || 'recette' }));
    // explicitDebtIndex covers ALL dette versements (incl. contravention-flagged ones)
    // so implicit debts in step 3 are still deduped against days where a dette exists.
    const explicitDebtIndex = new Set(allDetteVersements.map(v => `${v.chauffeurId}|${v.date}`));

    // 2. Unpaid contraventions from the contraventions table — only `impayee` counts as debt.
    // `contestee` is a pending dispute (not a confirmed debt) — the /controle-conduite and
    // /contraventions KPIs exclude it from "Total impayé", so we do the same here.
    const allDettes = [...dettesExplicites];
    const contraImpayees = (contraventions || []).filter(c => c.statut === 'impayee' && c.montant > 0 && c.chauffeurId);
    contraImpayees.forEach(c => {
      allDettes.push({
        id: `contra_${c.id}`, chauffeurId: c.chauffeurId, date: c.date,
        manquant: c.montant, traitementManquant: 'dette', source: 'contravention',
        commentaire: `Contravention — ${c.type || 'amende'}`, reference: c.id, implicit: false
      });
    });

    // 3. Implicit debts (past planning without payment)
    const pastPlannings = planning.filter(p => p.date >= thirtyDaysAgoStr && p.date < todayStr);
    const pastScheduled = new Map();
    pastPlannings.forEach(p => {
      const key = `${p.chauffeurId}|${p.date}`;
      if (!pastScheduled.has(key)) pastScheduled.set(key, p);
    });
    const implicitDettes = [];
    pastScheduled.forEach((p) => {
      if (hasAbsence(p.chauffeurId, p.date)) return;
      const ch = chauffeurById.get(p.chauffeurId);
      if (!ch || ch.statut === 'inactif') return;
      // Un chauffeur salarié ne doit aucune recette : ne jamais lui créer de dette.
      if (ch.typeContrat === 'salarie') return;
      // Location : base (override planning ▸ redevance du chauffeur ▸ réglage de
      // flotte 35 000) + taux Yango (23 %) × CA brut du jour (caIndex = synchro
      // Yango). detailLocation sert à l'affichage (« Base + % × CA »).
      const caKey = `${p.chauffeurId}|${p.date}`;
      const loc = this.montantDuLocation(ch, p, caIndex.has(caKey) ? caIndex.get(caKey) : null);
      if (loc.du <= 0) return;
      if (paymentIndex.has(caKey)) return;
      if (explicitDebtIndex.has(caKey)) return;
      implicitDettes.push({
        id: `implicit_${p.chauffeurId}_${p.date}`, chauffeurId: p.chauffeurId, date: p.date,
        manquant: loc.du, traitementManquant: 'dette', implicit: true, source: 'recette',
        detailLocation: loc
      });
    });

    // 3bis. Dette du chauffeur SALARIE : il doit verser, chaque jour travaille,
    // son CA brut Yango diminue de ses charges. Ce qu'il n'a pas verse est du.
    // (Decision du 2026-08-28 : remplace l'ancienne regle « le salarie ne doit
    //  aucune recette ». Voir [[volt-modele-salariat]].)
    (caJour || []).forEach(e => {
      const date = e.date;
      if (!date || date < thirtyDaysAgoStr || date >= todayStr) return;
      const ch = chauffeurById.get(e.chauffeurId);
      if (!ch || ch.statut === 'inactif' || ch.typeContrat !== 'salarie') return;
      if (hasAbsence(ch.id, date)) return;
      const caBrut = Number(e.caBrut) || 0;
      // Salariés : le montant à régler part du CA NET (CA − commission société/Yango),
      // pas du CA brut. Le CA brut reste affiché en référence et le montant est
      // ajustable à l'encaissement. Voir [[volt-modele-salariat]].
      const commission = Number(e.commissionYango != null ? e.commissionYango : (e.commission_yango || 0)) || 0;
      const caNet = (e.caNet != null || e.ca_net != null) ? (Number(e.caNet != null ? e.caNet : e.ca_net) || 0) : Math.max(0, caBrut - commission);
      const charge = chargesIndex.get(`${ch.id}|${date}`) || 0;
      const du = Math.max(0, caNet - charge);
      if (du <= 0) return;
      if (explicitDebtIndex.has(`${ch.id}|${date}`)) return;   // dette deja saisie a la main
      if (annulationIndex.has(`${ch.id}|${date}`)) return;    // dette annulee ou passee en perte
      const verse = versementSumIndex.get(`${ch.id}|${date}`) || 0;
      const manquant = Math.round(du - verse);
      if (manquant <= 0) return;
      implicitDettes.push({
        id: `salarie_${ch.id}_${date}`, chauffeurId: ch.id, date,
        manquant, traitementManquant: 'dette', implicit: true, source: 'recette',
        detailSalarie: { caBrut, commission, caNet, charge, du, verse }
      });
    });

    const combined = [...allDettes, ...implicitDettes];

    // Group by driver
    const byDriver = {};
    combined.forEach(v => {
      if (!byDriver[v.chauffeurId]) byDriver[v.chauffeurId] = { items: [], total: 0 };
      byDriver[v.chauffeurId].items.push(v);
      byDriver[v.chauffeurId].total += v.manquant;
    });
    const detteList = Object.keys(byDriver).map(cId => {
      const ch = chauffeurById.get(cId);
      const d = byDriver[cId];
      d.items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return {
        chauffeurId: cId, nom: ch ? `${ch.prenom} ${ch.nom}` : cId,
        count: d.items.length, total: d.total,
        lastDate: d.items[d.items.length - 1]?.date || '', items: d.items
      };
    }).sort((a, b) => b.total - a.total);

    // Separate by type
    const allItems = detteList.flatMap(d => d.items);
    const totalDettesRecettes = allItems.filter(v => v.source !== 'contravention').reduce((s, v) => s + (v.manquant || 0), 0);
    const totalDettesContraventions = allItems.filter(v => v.source === 'contravention').reduce((s, v) => s + (v.manquant || 0), 0);
    const totalDettes = totalDettesRecettes + totalDettesContraventions;
    const nbDriversRecettes = new Set(allItems.filter(v => v.source !== 'contravention').map(v => v.chauffeurId)).size;
    const nbDriversContraventions = new Set(allItems.filter(v => v.source === 'contravention').map(v => v.chauffeurId)).size;
    const nbDetteDrivers = new Set(allItems.map(v => v.chauffeurId)).size;

    const detteListRecettes = detteList.map(d => {
      const recItems = d.items.filter(v => v.source !== 'contravention');
      if (recItems.length === 0) return null;
      return { ...d, items: recItems, total: recItems.reduce((s, v) => s + (v.manquant || 0), 0), count: recItems.length };
    }).filter(Boolean).sort((a, b) => b.total - a.total);
    const detteListContraventions = detteList.map(d => {
      const conItems = d.items.filter(v => v.source === 'contravention');
      if (conItems.length === 0) return null;
      return { ...d, items: conItems, total: conItems.reduce((s, v) => s + (v.manquant || 0), 0), count: conItems.length };
    }).filter(Boolean).sort((a, b) => b.total - a.total);

    const totalPertes = versements.filter(v => v.traitementManquant === 'perte' && v.manquant > 0).reduce((s, v) => s + v.manquant, 0);

    return {
      detteList, totalDettes, totalPertes, chauffeurs,
      totalDettesRecettes, totalDettesContraventions,
      nbDriversRecettes, nbDriversContraventions, nbDetteDrivers,
      detteListRecettes, detteListContraventions
    };
  }
};
