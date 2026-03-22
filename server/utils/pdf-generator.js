const PDFDocument = require('pdfkit');
const Chauffeur = require('../models/Chauffeur');
const Versement = require('../models/Versement');
const Contravention = require('../models/Contravention');

/**
 * Genere un releve mensuel PDF pour un chauffeur.
 * @param {string} chauffeurId
 * @param {string} mois - format YYYY-MM
 * @param {string} [entrepriseId] - optionnel, filtre par entreprise
 * @returns {Promise<Buffer>} buffer PDF
 */
async function generateMonthlyReport(chauffeurId, mois, entrepriseId) {
  // --- Chargement des donnees ---
  const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
  if (!chauffeur) throw new Error('Chauffeur introuvable');

  const filter = { chauffeurId, date: { $regex: `^${mois}` } };
  if (entrepriseId) filter.entrepriseId = entrepriseId;

  const [versements, contraventions] = await Promise.all([
    Versement.find(filter).sort({ date: 1 }).lean(),
    Contravention.find({ chauffeurId, date: { $regex: `^${mois}` }, ...(entrepriseId ? { entrepriseId } : {}) }).sort({ date: 1 }).lean()
  ]);

  // Dettes : versements avec traitementManquant === 'dette' et manquant > 0
  const dettes = versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0);

  // Versements affichables (hors supprime)
  const versementsAffichables = versements.filter(v => v.statut !== 'supprime');

  // --- Construction du PDF ---
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - 100; // marges 50+50
  const nomComplet = `${chauffeur.prenom || ''} ${chauffeur.nom || ''}`.trim();
  const moisLabel = formatMoisLabel(mois);

  // --- En-tete ---
  doc.font('Helvetica-Bold').fontSize(20).text('Pilote — Releve mensuel', { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(12).text(`Chauffeur : ${nomComplet}`, { align: 'center' });
  doc.text(`Periode : ${moisLabel}`, { align: 'center' });
  doc.moveDown(1);
  drawLine(doc, pageWidth);
  doc.moveDown(0.8);

  // --- Section 1 : Versements du mois ---
  sectionTitle(doc, '1. Versements du mois');

  if (versementsAffichables.length === 0) {
    doc.font('Helvetica').fontSize(10).text('Aucun versement pour ce mois.', { indent: 10 });
  } else {
    const colWidths = [90, 120, 120, pageWidth - 330];
    const headers = ['Date', 'Montant verse', 'Montant brut', 'Statut'];
    drawTableHeader(doc, headers, colWidths);

    for (const v of versementsAffichables) {
      const row = [
        formatDate(v.date),
        formatMontant(v.montantVerse),
        formatMontant(v.montantBrut),
        formatStatut(v.statut)
      ];
      drawTableRow(doc, row, colWidths);
    }

    // Total
    const totalVerse = versementsAffichables.reduce((s, v) => s + (v.montantVerse || 0), 0);
    const totalBrut = versementsAffichables.reduce((s, v) => s + (v.montantBrut || 0), 0);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10)
      .text(`Total verse : ${formatMontant(totalVerse)}    |    Total brut : ${formatMontant(totalBrut)}`, { indent: 10 });
  }

  doc.moveDown(1);

  // --- Section 2 : Dettes en cours ---
  sectionTitle(doc, '2. Dettes en cours');

  if (dettes.length === 0) {
    doc.font('Helvetica').fontSize(10).text('Aucune dette pour ce mois.', { indent: 10 });
  } else {
    const colWidths = [90, 150, pageWidth - 240];
    const headers = ['Date', 'Montant', 'Type'];
    drawTableHeader(doc, headers, colWidths);

    for (const d of dettes) {
      const row = [
        formatDate(d.date),
        formatMontant(d.manquant),
        'Versement partiel'
      ];
      drawTableRow(doc, row, colWidths);
    }

    const totalDettes = dettes.reduce((s, d) => s + (d.manquant || 0), 0);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10)
      .text(`Total dettes : ${formatMontant(totalDettes)}`, { indent: 10 });
  }

  doc.moveDown(1);

  // --- Section 3 : Contraventions ---
  sectionTitle(doc, '3. Contraventions');

  if (contraventions.length === 0) {
    doc.font('Helvetica').fontSize(10).text('Aucune contravention pour ce mois.', { indent: 10 });
  } else {
    const colWidths = [90, 130, 120, pageWidth - 340];
    const headers = ['Date', 'Type', 'Montant', 'Statut'];
    drawTableHeader(doc, headers, colWidths);

    for (const c of contraventions) {
      const row = [
        formatDate(c.date),
        c.type || '--',
        formatMontant(c.montant),
        c.statut || '--'
      ];
      drawTableRow(doc, row, colWidths);
    }

    const totalContr = contraventions.reduce((s, c) => s + (c.montant || 0), 0);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10)
      .text(`Total contraventions : ${formatMontant(totalContr)}`, { indent: 10 });
  }

  doc.moveDown(1);

  // --- Section 4 : Score de conduite ---
  sectionTitle(doc, '4. Score de conduite');
  const score = chauffeur.scoreConduite != null ? chauffeur.scoreConduite : '--';
  doc.font('Helvetica').fontSize(11)
    .text(`Score global : ${score} / 100`, { indent: 10 });

  // --- Pied de page ---
  doc.moveDown(2);
  drawLine(doc, pageWidth);
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#666666')
    .text(`Genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });

  doc.end();
  return finished;
}

// ====== Helpers ======

function sectionTitle(doc, title) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e293b').text(title);
  doc.moveDown(0.4);
  doc.fillColor('#000000');
}

function drawLine(doc, width) {
  const x = doc.x;
  const y = doc.y;
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor('#cbd5e1').lineWidth(1).stroke();
}

function drawTableHeader(doc, headers, colWidths) {
  const startX = doc.x;
  let x = startX;
  const y = doc.y;

  // Fond header
  doc.rect(x, y - 2, colWidths.reduce((a, b) => a + b, 0), 18).fill('#f1f5f9');
  doc.fillColor('#334155');

  doc.font('Helvetica-Bold').fontSize(9);
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 4, y + 2, { width: colWidths[i] - 8, continued: false });
    x += colWidths[i];
  }
  doc.y = y + 20;
  doc.x = startX;
  doc.fillColor('#000000');
}

function drawTableRow(doc, cells, colWidths) {
  // Saut de page si on est trop bas
  if (doc.y > doc.page.height - 80) {
    doc.addPage();
  }

  const startX = doc.x;
  let x = startX;
  const y = doc.y;

  doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
  for (let i = 0; i < cells.length; i++) {
    doc.text(String(cells[i] ?? '--'), x + 4, y + 2, { width: colWidths[i] - 8, continued: false });
    x += colWidths[i];
  }
  doc.y = y + 16;
  doc.x = startX;
  doc.fillColor('#000000');
}

function formatMontant(val) {
  if (val == null) return '--';
  return Number(val).toLocaleString('fr-FR') + ' FCFA';
}

function formatDate(d) {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return d;
  }
}

function formatStatut(s) {
  const map = {
    valide: 'Valide',
    en_attente: 'En attente',
    partiel: 'Partiel',
    supprime: 'Supprime'
  };
  return map[s] || s || '--';
}

function formatMoisLabel(mois) {
  const [annee, m] = mois.split('-');
  const noms = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  return `${noms[parseInt(m, 10) - 1] || m} ${annee}`;
}

module.exports = { generateMonthlyReport };
