/**
 * Migration: Reconnect orphaned versement debt records to their contraventions.
 *
 * Before this fix, the Versement schema was missing the `reference` and `montantAttendu` fields,
 * so Mongoose silently stripped them on save. This caused contravention debts to be double-counted
 * in the debt computation (once as versement debt, once as unmatched contravention).
 *
 * This script matches orphaned versements to contraventions by chauffeurId + date + montant
 * and restores the `reference` field.
 *
 * Usage: node server/utils/fix-versement-references.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function run() {
  if (!MONGO_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const Versement = require('../models/Versement');
  const Contravention = require('../models/Contravention');

  // Find all versements that look like contravention debts but have no reference
  const orphans = await Versement.find({
    traitementManquant: 'dette',
    manquant: { $gt: 0 },
    $or: [
      { source: 'contravention' },
      { commentaire: { $regex: /contravention/i } }
    ],
    $or: [
      { reference: null },
      { reference: { $exists: false } },
      { reference: '' }
    ]
  }).lean();

  console.log(`Found ${orphans.length} orphaned contravention versements`);

  // Get all contraventions
  const contras = await Contravention.find({}).lean();
  console.log(`Found ${contras.length} total contraventions`);

  // Get all versements with references (already linked)
  const linked = await Versement.find({ reference: { $exists: true, $ne: null, $ne: '' } }).lean();
  const linkedRefs = new Set(linked.map(v => v.reference));

  let fixed = 0;
  for (const orphan of orphans) {
    // Find matching contravention by chauffeurId + date + montant that isn't already linked
    const match = contras.find(c =>
      c.chauffeurId === orphan.chauffeurId &&
      c.date === orphan.date &&
      c.montant === (orphan.montantAttendu || orphan.manquant) &&
      !linkedRefs.has(c.id)
    );

    if (match) {
      await Versement.updateOne(
        { id: orphan.id },
        { $set: { reference: match.id, montantAttendu: match.montant } }
      );
      linkedRefs.add(match.id);
      fixed++;
      console.log(`  Fixed: ${orphan.id} → ${match.id} (${orphan.chauffeurId}, ${orphan.date}, ${match.montant} FCFA)`);
    } else {
      console.log(`  No match for: ${orphan.id} (${orphan.chauffeurId}, ${orphan.date}, ${orphan.manquant} FCFA)`);
    }
  }

  console.log(`\nFixed ${fixed}/${orphans.length} orphaned versements`);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
