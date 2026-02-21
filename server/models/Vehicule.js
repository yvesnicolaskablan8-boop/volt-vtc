const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  id: String,
  date: String,
  type: String,
  description: String,
  montant: Number,
  kilometrage: Number
}, { _id: false });

const vehiculeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  marque: { type: String, required: true },
  modele: { type: String, required: true },
  annee: Number,
  immatriculation: { type: String, required: true },
  vin: String,
  couleur: String,
  typeEnergie: { type: String, enum: ['thermique', 'electrique', 'hybride'], default: 'thermique' },
  typeAcquisition: { type: String, enum: ['leasing', 'cash'], default: 'cash' },
  prixAchat: Number,
  mensualiteLeasing: Number,
  dureeLeasing: Number,
  apportInitial: Number,
  datePremiereMensualite: String,
  kilometrage: { type: Number, default: 0 },
  kilometrageMensuel: Number,
  dateDerniereRevision: String,
  prochainRevisionKm: Number,
  assureur: String,
  numeroPolice: String,
  primeAnnuelle: Number,
  dateExpirationAssurance: String,
  coutsMaintenance: [maintenanceSchema],
  statut: { type: String, enum: ['en_service', 'en_maintenance', 'hors_service'], default: 'en_service' },
  chauffeurAssigne: String,
  consommation: Number,
  coutEnergie: Number,
  // Champs spécifiques véhicules électriques
  capaciteBatterie: Number,
  autonomieKm: Number,
  niveauBatterie: Number,
  typeChargeur: String,
  puissanceChargeMax: Number,
  tempsRechargeRapide: Number,
  tempsRechargeNormale: Number,
  dernierRecharge: String,
  stationRechargeHabituelle: String,
  dateCreation: { type: String, default: () => new Date().toISOString() }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Vehicule', vehiculeSchema);
