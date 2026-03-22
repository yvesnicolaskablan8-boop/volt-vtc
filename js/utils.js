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
  generateId(prefix) {
    const num = Math.floor(Math.random() * 900000) + 100000;
    return `${prefix}-${num}`;
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
    // Versement references that have been paid (for contravention dedup)
    const paidReferences = new Set();
    versements.forEach(v => {
      if (v.reference && (v.statut === 'valide' || v.statut === 'supprime')) {
        paidReferences.add(v.reference);
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
    const dettesExplicites = versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0)
      .map(v => ({ ...v, source: this.isContravention(v) ? 'contravention' : (v.source || 'recette') }));
    const explicitDebtIndex = new Set(dettesExplicites.map(v => `${v.chauffeurId}|${v.date}`));
    const explicitRefIndex = new Set(dettesExplicites.map(v => v.reference).filter(Boolean));

    // 2. Unpaid contraventions without existing versement
    const allDettes = [...dettesExplicites];
    const contraImpayees = (contraventions || []).filter(c => (c.statut === 'impayee' || c.statut === 'contestee') && c.montant > 0 && c.chauffeurId);
    contraImpayees.forEach(c => {
      if (!explicitRefIndex.has(c.id) && !paidReferences.has(c.id)) {
        allDettes.push({
          id: `contra_${c.id}`, chauffeurId: c.chauffeurId, date: c.date,
          manquant: c.montant, traitementManquant: 'dette', source: 'contravention',
          commentaire: `Contravention — ${c.type || 'amende'}`, reference: c.id, implicit: false
        });
      }
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
