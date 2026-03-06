/**
 * ClassementPage — Leaderboard anonymise entre chauffeurs
 */
const ClassementPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const classement = await DriverStore.getClassement();

    if (!classement || classement.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="margin-top:2rem">
          <iconify-icon icon="solar:cup-star-bold-duotone" style="font-size:3rem;color:#cbd5e1;display:block;margin-bottom:8px"></iconify-icon>
          <p>Classement indisponible</p>
        </div>`;
      return;
    }

    // Top 3 podium
    const top3 = classement.slice(0, 3);
    const others = classement.slice(3);
    const medals = ['🏆', '🥈', '🥉'];
    const podiumColors = ['#f59e0b', '#94a3b8', '#cd7f32'];

    container.innerHTML = `
      <!-- Header -->
      <div style="text-align:center;margin-bottom:1.5rem">
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">Classement</h2>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">Score de conduite entre chauffeurs</p>
      </div>

      <!-- Podium Top 3 -->
      <div style="display:flex;justify-content:center;align-items:flex-end;gap:12px;margin-bottom:2rem;padding:0 1rem">
        ${top3.length >= 2 ? this._podiumCard(top3[1], 1, medals[1], podiumColors[1], '80px') : ''}
        ${top3.length >= 1 ? this._podiumCard(top3[0], 0, medals[0], podiumColors[0], '100px') : ''}
        ${top3.length >= 3 ? this._podiumCard(top3[2], 2, medals[2], podiumColors[2], '65px') : ''}
      </div>

      <!-- Liste complète -->
      <div style="display:flex;flex-direction:column;gap:8px">
        ${classement.map((c, i) => this._renderRow(c, i)).join('')}
      </div>

      <div style="height:20px"></div>
    `;
  },

  _podiumCard(chauffeur, index, medal, borderColor, height) {
    const score = chauffeur.score || 0;
    const scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const isMoi = chauffeur.estMoi;
    const name = chauffeur.prenom || '---';

    return `
      <div style="display:flex;flex-direction:column;align-items:center;flex:1;max-width:110px">
        <div style="font-size:1.8rem;margin-bottom:4px">${medal}</div>
        <div style="width:56px;height:56px;border-radius:50%;background:${isMoi ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'var(--bg-tertiary)'};display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;color:${isMoi ? 'white' : 'var(--text-primary)'};border:3px solid ${borderColor};margin-bottom:6px">${name.charAt(0).toUpperCase()}</div>
        <div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">${name}${isMoi ? ' (vous)' : ''}</div>
        <div style="font-size:1.1rem;font-weight:900;color:${scoreColor};margin-top:2px">${score}</div>
        <div style="width:100%;height:${height};border-radius:12px 12px 0 0;background:${isMoi ? 'linear-gradient(180deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))' : 'var(--bg-tertiary)'};margin-top:6px"></div>
      </div>`;
  },

  _renderRow(chauffeur, index) {
    const rang = chauffeur.rang || (index + 1);
    const score = chauffeur.score || 0;
    const scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const isMoi = chauffeur.estMoi;
    const name = chauffeur.prenom || '---';

    // Tendance
    let tendanceIcon = '';
    if (chauffeur.tendance === 'up') tendanceIcon = '<span style="color:#22c55e;font-size:0.85rem">↑</span>';
    else if (chauffeur.tendance === 'down') tendanceIcon = '<span style="color:#ef4444;font-size:0.85rem">↓</span>';
    else tendanceIcon = '<span style="color:#94a3b8;font-size:0.85rem">→</span>';

    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:1.25rem;background:${isMoi ? 'rgba(59,130,246,0.06)' : 'var(--bg-secondary)'};border:${isMoi ? '2px solid rgba(59,130,246,0.3)' : '1px solid var(--border-color)'};${isMoi ? 'box-shadow:0 0 0 3px rgba(59,130,246,0.08)' : ''}">
        <div style="width:32px;height:32px;border-radius:50%;background:${rang <= 3 ? 'rgba(245,158,11,0.1)' : 'var(--bg-tertiary)'};display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:800;color:${rang <= 3 ? '#f59e0b' : 'var(--text-muted)'};flex-shrink:0">${rang}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:${isMoi ? '800' : '600'};font-size:0.88rem;color:var(--text-primary)">
            ${name}${isMoi ? ' <span style="font-size:0.7rem;color:#3b82f6;font-weight:700">(vous)</span>' : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${tendanceIcon}
          <div style="font-size:1.1rem;font-weight:900;color:${scoreColor}">${score}</div>
        </div>
      </div>`;
  },

  destroy() {}
};
