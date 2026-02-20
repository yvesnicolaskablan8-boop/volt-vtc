/**
 * Utils - Formatting, ID generation, helpers
 */
const Utils = {
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
      actif: { class: 'badge-success', icon: 'fa-circle', label: 'Actif' },
      inactif: { class: 'badge-danger', icon: 'fa-circle', label: 'Inactif' },
      suspendu: { class: 'badge-warning', icon: 'fa-circle', label: 'Suspendu' },
      en_service: { class: 'badge-success', icon: 'fa-circle', label: 'En service' },
      en_maintenance: { class: 'badge-warning', icon: 'fa-wrench', label: 'Maintenance' },
      hors_service: { class: 'badge-danger', icon: 'fa-circle-xmark', label: 'Hors service' },
      valide: { class: 'badge-success', icon: 'fa-check', label: 'Validé' },
      en_attente: { class: 'badge-warning', icon: 'fa-clock', label: 'En attente' },
      retard: { class: 'badge-danger', icon: 'fa-exclamation-triangle', label: 'En retard' },
      partiel: { class: 'badge-info', icon: 'fa-adjust', label: 'Partiel' },
      terminee: { class: 'badge-success', icon: 'fa-check', label: 'Terminée' },
      en_cours: { class: 'badge-info', icon: 'fa-spinner', label: 'En cours' },
      annulee: { class: 'badge-danger', icon: 'fa-times', label: 'Annulée' },
      expire: { class: 'badge-danger', icon: 'fa-exclamation-circle', label: 'Expiré' },
      a_renouveler: { class: 'badge-warning', icon: 'fa-exclamation-circle', label: 'À renouveler' }
    };
    const c = config[statut] || { class: 'badge-neutral', icon: 'fa-circle', label: statut };
    return `<span class="badge ${c.class}"><i class="fas ${c.icon}" style="font-size:6px"></i> ${c.label}</span>`;
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
    doc.text('VOLT', 14, 16);
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

    doc.save(`volt-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`);
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

  // Chart.js theme-aware defaults
  configureChartDefaults() {
    if (typeof Chart === 'undefined') return;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
    Chart.defaults.borderColor = isDark ? '#1e293b' : '#e2e8f0';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = isDark ? '#1a2235' : '#ffffff';
    Chart.defaults.plugins.tooltip.titleColor = isDark ? '#f1f5f9' : '#0f172a';
    Chart.defaults.plugins.tooltip.bodyColor = isDark ? '#94a3b8' : '#475569';
    Chart.defaults.plugins.tooltip.borderColor = '#3b82f6';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.displayColors = true;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 6;
    Chart.defaults.elements.line.tension = 0.4;
    Chart.defaults.elements.bar.borderRadius = 4;
    Chart.defaults.scale.grid = { color: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(226, 232, 240, 0.8)' };

    // Animation d'entrée
    Chart.defaults.animation = {
      duration: 800,
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
  }
};
