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
      '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'
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

  /**
   * Simule un mois de planification en binome titulaire/doublure.
   *
   * Regles appliquees (identiques au planning reel) :
   *  - le titulaire conduit tous les jours sauf son jour de repos ;
   *  - une doublure couvre ce jour de repos ;
   *  - personne ne depasse 6 jours consecutifs ;
   *  - un chauffeur ne peut pas conduire deux voitures le meme jour.
   *
   * Le parcours se fait JOUR par JOUR : voiture par voiture, le compteur de
   * jours consecutifs repartirait en arriere a chaque changement de vehicule
   * et la regle des 6 jours ne serait plus verifiee.
   */
  simulerPlanningMois({ annee, mois, titulaires, doublures }) {
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    // `repos` accepte un jour unique ou une liste (salaries : 2 jours par semaine)
    const joursRepos = (t) => {
      if (Array.isArray(t.repos)) return t.repos.filter(x => x === 0 || x);
      const l = [];
      if (t.repos === 0 || t.repos) l.push(Number(t.repos));
      if (t.repos2 === 0 || t.repos2) l.push(Number(t.repos2));
      return l;
    };
    const tit = (titulaires || []).map(t => ({ ...t, repos: joursRepos(t), jours: [] }));
    const doub = (doublures || []).map(d => ({ ...d, aRecruter: false, jours: [] }));
    const cleDe = (p) => p.id || p.nom;

    const prisParJour = {}, dernier = {};
    const consec = (cle, j) => { const d = dernier[cle]; return (d && d.jour === j - 1) ? d.consec : 0; };
    const marquer = (cle, j) => {
      const n = consec(cle, j) + 1;
      dernier[cle] = { jour: j, consec: n };
      (prisParJour[j] = prisParJour[j] || new Set()).add(cle);
    };

    const grille = tit.map(() => []);
    let arrets = 0;

    for (let j = 1; j <= nbJours; j++) {
      const dow = new Date(annee, mois, j).getDay();
      for (let v = 0; v < tit.length; v++) {
        const T = tit[v];
        if (!T.repos.includes(dow)) {
          if (consec(cleDe(T), j) >= 6) { grille[v].push(null); arrets++; continue; }
          marquer(cleDe(T), j); T.jours.push(j);
          grille[v].push({ id: cleDe(T), nom: T.nom, role: 'titulaire' });
        } else {
          // Repartition equitable : parmi les doublures disponibles, celle qui a
          // travaille le moins de jours jusqu'ici. Sans ce tri, la premiere de la
          // liste absorbe presque tous les remplacements.
          const dispo = doub.filter(x => !(prisParJour[j] && prisParJour[j].has(cleDe(x))) && consec(cleDe(x), j) < 6);
          let d = dispo.sort((a, b) => a.jours.length - b.jours.length)[0];
          if (!d) {
            d = { id: 'AUTO-' + (doub.length + 1), nom: 'Doublure ' + (doub.length + 1), aRecruter: true, jours: [] };
            doub.push(d);
          }
          marquer(cleDe(d), j); d.jours.push(j);
          grille[v].push({ id: cleDe(d), nom: d.nom, role: 'doublure', aRecruter: !!d.aRecruter });
        }
      }
    }

    const joursTitulaires = tit.reduce((s, t) => s + t.jours.length, 0);
    const joursDoublures = doub.reduce((s, d) => s + d.jours.length, 0);
    return { nbJours, grille, titulaires: tit, doublures: doub, arrets, joursTitulaires, joursDoublures };
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

  computeDebts({ versements, chauffeurs, planning, absences, contraventions }) {
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
      const redevance = (p.redevanceOverride != null && p.redevanceOverride > 0) ? p.redevanceOverride : (ch.redevanceQuotidienne || 0);
      if (redevance <= 0) return;
      if (paymentIndex.has(`${p.chauffeurId}|${p.date}`)) return;
      if (explicitDebtIndex.has(`${p.chauffeurId}|${p.date}`)) return;
      implicitDettes.push({
        id: `implicit_${p.chauffeurId}_${p.date}`, chauffeurId: p.chauffeurId, date: p.date,
        manquant: redevance, traitementManquant: 'dette', implicit: true, source: 'recette'
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
