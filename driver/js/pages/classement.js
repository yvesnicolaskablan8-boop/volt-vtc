/**
 * ClassementPage — Classement hebdomadaire avec bonus
 * Affiche le rang du chauffeur, podium top 3, liste complete et info bonus
 * Note: innerHTML usage follows existing codebase patterns for this vanilla JS SPA.
 * All data comes from the authenticated server API (not user input).
 */
const ClassementPage = {
  async render(container) {
    // Skeleton loading
    container.innerHTML = '<div style="padding:8px 0">'
      + '<div class="skeleton skeleton-line w-50" style="height:24px;margin-bottom:12px"></div>'
      + '<div class="skeleton skeleton-card" style="height:120px"></div>'
      + '<div style="display:flex;gap:10px;margin-top:12px">'
      + '<div class="skeleton" style="flex:1;height:160px;border-radius:1.25rem"></div>'
      + '<div class="skeleton" style="flex:1;height:180px;border-radius:1.25rem"></div>'
      + '<div class="skeleton" style="flex:1;height:140px;border-radius:1.25rem"></div>'
      + '</div>'
      + '<div class="skeleton skeleton-card" style="height:60px;margin-top:12px"></div>'
      + '<div class="skeleton skeleton-card" style="height:60px;margin-top:8px"></div>'
      + '<div class="skeleton skeleton-card" style="height:60px;margin-top:8px"></div>'
      + '</div>';

    const data = await DriverStore.getClassement();

    if (!data || !data.classement || data.classement.length === 0) {
      container.innerHTML = '<div class="empty-state" style="margin-top:2rem">'
        + '<iconify-icon icon="solar:cup-star-bold-duotone" style="font-size:3rem;color:#cbd5e1;display:block;margin-bottom:8px"></iconify-icon>'
        + '<p>Classement indisponible pour le moment</p>'
        + '</div>';
      return;
    }

    const classement = data.classement;
    const currentUserRang = data.currentUserRang;
    const currentUserScore = data.currentUserScore;
    const totalParticipants = data.totalParticipants;
    const bonus = data.bonus;
    const semaineDebut = data.semaineDebut;
    const semaineFin = data.semaineFin;
    const dernierGagnant = data.dernierGagnant;
    const top3 = classement.slice(0, 3);
    const leaderScore = top3.length > 0 ? top3[0].score : 100;

    // Formater dates semaine
    var fmtDate = function(ds) {
      if (!ds) return '';
      var parts = ds.split('-');
      return parts[2] + '/' + parts[1];
    };
    var semLabel = fmtDate(semaineDebut) + ' - ' + fmtDate(semaineFin);

    var html = '';

    // En-tete
    html += '<div style="text-align:center;margin-bottom:1.2rem">'
      + '<h2 style="font-size:1.3rem;font-weight:900;color:var(--text-primary);display:flex;align-items:center;justify-content:center;gap:8px">'
      + '<iconify-icon icon="solar:cup-star-bold-duotone" style="color:#f59e0b;font-size:1.5rem"></iconify-icon>'
      + 'Classement'
      + '</h2>'
      + '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Semaine du ' + semLabel + '</p>'
      + '</div>';

    // Rang actuel + barre de progression
    if (currentUserRang) {
      var rangColor = currentUserRang === 1 ? '#f59e0b' : currentUserRang <= 3 ? '#3b82f6' : 'var(--text-primary)';
      html += '<div class="glass-card" style="padding:1.25rem;margin-bottom:1.2rem;text-align:center;border:1px solid var(--glass-border)">'
        + '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:8px">Votre position</div>'
        + '<div style="font-size:2.2rem;font-weight:900;color:' + rangColor + ';line-height:1">'
        + '#' + currentUserRang
        + ' <span style="font-size:0.9rem;font-weight:600;color:var(--text-muted)">/ ' + totalParticipants + '</span>'
        + '</div>'
        + '<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;font-weight:600">Score : ' + currentUserScore + '/100</div>';

      if (currentUserRang > 1) {
        var pct = leaderScore > 0 ? Math.round((currentUserScore / leaderScore) * 100) : 0;
        var ecart = leaderScore - currentUserScore;
        html += '<div style="margin-top:12px">'
          + '<div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-bottom:4px">'
          + '<span>Vous : ' + currentUserScore + '</span>'
          + '<span>#1 : ' + leaderScore + '</span>'
          + '</div>'
          + '<div style="height:8px;border-radius:4px;background:var(--bg-tertiary);overflow:hidden">'
          + '<div style="height:100%;width:' + pct + '%;border-radius:4px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);transition:width 0.6s ease"></div>'
          + '</div>'
          + '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">' + ecart + ' pts d\'ecart avec le leader</div>'
          + '</div>';
      } else {
        html += '<div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;color:#f59e0b;font-weight:700;font-size:0.85rem">'
          + '<iconify-icon icon="solar:medal-star-bold-duotone" style="font-size:1.2rem"></iconify-icon>'
          + 'Vous etes en tete !'
          + '</div>';
      }
      html += '</div>';
    }

    // Bonus info
    var bonusStr = bonus ? bonus.toLocaleString('fr-FR') : '25 000';
    html += '<div class="glass-card tap-scale" style="padding:14px 16px;margin-bottom:1.2rem;display:flex;align-items:center;gap:12px;border:1px solid rgba(245,158,11,0.2);background:rgba(245,158,11,0.04)">'
      + '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      + '<iconify-icon icon="solar:hand-money-bold-duotone" style="font-size:1.3rem"></iconify-icon>'
      + '</div>'
      + '<div style="flex:1">'
      + '<div style="font-size:0.82rem;font-weight:700;color:var(--text-primary)">Bonus hebdomadaire</div>'
      + '<div style="font-size:0.75rem;color:var(--text-muted)">Le 1er chaque semaine remporte <strong style="color:#f59e0b">' + bonusStr + ' FCFA</strong></div>'
      + '</div>'
      + '</div>';

    // Podium Top 3
    if (top3.length >= 3) {
      html += this._renderPodium(top3);
    }

    // Legende ponderation
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:1rem;padding:10px 12px;border-radius:12px;background:var(--bg-secondary)">'
      + '<span style="font-size:0.65rem;color:var(--text-muted);display:flex;align-items:center;gap:3px">'
      + '<iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#3b82f6;font-size:0.8rem"></iconify-icon> Recettes 40%</span>'
      + '<span style="font-size:0.65rem;color:var(--text-muted);display:flex;align-items:center;gap:3px">'
      + '<iconify-icon icon="solar:steering-wheel-bold-duotone" style="color:#8b5cf6;font-size:0.8rem"></iconify-icon> Conduite 25%</span>'
      + '<span style="font-size:0.65rem;color:var(--text-muted);display:flex;align-items:center;gap:3px">'
      + '<iconify-icon icon="solar:calendar-check-bold-duotone" style="color:#22c55e;font-size:0.8rem"></iconify-icon> Regularite 20%</span>'
      + '<span style="font-size:0.65rem;color:var(--text-muted);display:flex;align-items:center;gap:3px">'
      + '<iconify-icon icon="solar:shield-warning-bold-duotone" style="color:#ef4444;font-size:0.8rem"></iconify-icon> Infractions 15%</span>'
      + '</div>';

    // Liste complete
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem">';
    for (var i = 0; i < classement.length; i++) {
      html += this._renderRow(classement[i], i);
    }
    html += '</div>';

    // Dernier gagnant
    if (dernierGagnant) {
      html += '<div class="glass-card" style="padding:14px 16px;margin-bottom:1.5rem;display:flex;align-items:center;gap:12px;border:1px solid rgba(34,197,94,0.2);background:rgba(34,197,94,0.04)">'
        + '<div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + '<iconify-icon icon="solar:medal-ribbons-star-bold-duotone" style="font-size:1.2rem"></iconify-icon>'
        + '</div>'
        + '<div style="flex:1">'
        + '<div style="font-size:0.75rem;font-weight:700;color:var(--text-primary)">Dernier gagnant</div>'
        + '<div style="font-size:0.72rem;color:var(--text-muted)">' + (dernierGagnant.prenom || '') + ' ' + (dernierGagnant.nom || '') + ' — ' + (dernierGagnant.semaine || '') + '</div>'
        + '</div>'
        + '</div>';
    }

    html += '<div style="height:20px"></div>';

    container.innerHTML = html;
  },

  _renderPodium(top3) {
    var medals = ['&#129351;', '&#129352;', '&#129353;'];
    var colors = ['#f59e0b', '#94a3b8', '#cd7f32'];
    var heights = ['110px', '85px', '65px'];
    var order = [1, 0, 2]; // 2nd, 1st, 3rd

    var html = '<div style="display:flex;justify-content:center;align-items:flex-end;gap:10px;margin-bottom:1.5rem;padding:0 0.5rem">';

    for (var oi = 0; oi < order.length; oi++) {
      var idx = order[oi];
      var c = top3[idx];
      if (!c) continue;
      var score = c.score || 0;
      var scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
      var isMoi = c.isCurrentUser;
      var initial = (c.prenom || '?').charAt(0).toUpperCase();
      var displayName = c.prenom + (c.nom ? ' ' + c.nom : '');
      var avatarSize = idx === 0 ? '60px' : '50px';
      var fSize = idx === 0 ? '1.3rem' : '1.1rem';

      html += '<div style="display:flex;flex-direction:column;align-items:center;flex:1;max-width:120px">'
        + '<div style="font-size:1.8rem;margin-bottom:4px">' + medals[idx] + '</div>'
        + '<div style="width:' + avatarSize + ';height:' + avatarSize + ';border-radius:50%;background:' + (isMoi ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'var(--bg-tertiary)') + ';display:flex;align-items:center;justify-content:center;font-size:' + fSize + ';font-weight:800;color:' + (isMoi ? 'white' : 'var(--text-primary)') + ';border:3px solid ' + colors[idx] + ';margin-bottom:6px">' + initial + '</div>'
        + '<div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">' + displayName + (isMoi ? ' <span style="font-size:0.6rem;color:#3b82f6">(vous)</span>' : '') + '</div>'
        + '<div style="font-size:1.1rem;font-weight:900;color:' + scoreColor + ';margin-top:2px">' + score + '</div>'
        + '<div style="width:100%;height:' + heights[idx] + ';border-radius:12px 12px 0 0;background:' + (isMoi ? 'linear-gradient(180deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))' : 'var(--bg-tertiary)') + ';margin-top:6px"></div>'
        + '</div>';
    }

    html += '</div>';
    return html;
  },

  _renderRow(c, index) {
    var rang = c.rang || (index + 1);
    var score = c.score || 0;
    var scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    var isMoi = c.isCurrentUser;
    var displayName = c.prenom + (c.nom ? ' ' + c.nom : '');

    var rankBg = rang === 1 ? 'rgba(245,158,11,0.12)' : rang === 2 ? 'rgba(148,163,184,0.12)' : rang === 3 ? 'rgba(205,127,50,0.12)' : 'var(--bg-tertiary)';
    var rankColor = rang === 1 ? '#f59e0b' : rang === 2 ? '#94a3b8' : rang === 3 ? '#cd7f32' : 'var(--text-muted)';

    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:1.25rem;background:' + (isMoi ? 'rgba(59,130,246,0.06)' : 'var(--bg-secondary)') + ';border:' + (isMoi ? '2px solid rgba(59,130,246,0.3)' : '1px solid var(--border-color)') + ';' + (isMoi ? 'box-shadow:0 0 0 3px rgba(59,130,246,0.08)' : '') + '">'
      + '<div style="width:32px;height:32px;border-radius:50%;background:' + rankBg + ';display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:800;color:' + rankColor + ';flex-shrink:0">' + rang + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:' + (isMoi ? '800' : '600') + ';font-size:0.88rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + displayName + (isMoi ? ' <span style="font-size:0.7rem;color:#3b82f6;font-weight:700">(vous)</span>' : '')
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<div style="width:40px;height:5px;border-radius:3px;background:rgba(0,0,0,.06);overflow:hidden">'
      + '<div style="height:100%;width:' + score + '%;border-radius:3px;background:' + scoreColor + ';transition:width 0.4s ease"></div>'
      + '</div>'
      + '<div style="font-size:1rem;font-weight:900;color:' + scoreColor + ';min-width:28px;text-align:right">' + score + '</div>'
      + '</div>'
      + '</div>';
  },

  destroy() {}
};
