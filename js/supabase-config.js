/**
 * Supabase Configuration - Client initialization for fleet management
 */
const SUPABASE_URL = 'https://cnwigcbgzzwvvihopvto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud2lnY2Jnenp3dnZpaG9wdnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTMzNTksImV4cCI6MjA5MTY2OTM1OX0.v9L44YLNpphKZZyMHSrDa9bYaxtZMqaF5BsEKtg9NH8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Collection name → Supabase table name mapping
const TABLE_MAP = {
  chauffeurs: 'fleet_chauffeurs',
  vehicules: 'fleet_vehicules',
  courses: 'fleet_courses',
  versements: 'fleet_versements',
  gps: 'fleet_gps',
  comptabilite: 'fleet_comptabilite',
  factures: 'fleet_factures',
  budgets: 'fleet_budgets',
  planning: 'fleet_planning',
  absences: 'fleet_absences',
  users: 'fleet_users',
  signalements: 'fleet_signalements',
  pointages: 'fleet_pointages',
  conduiteBrute: 'fleet_conduite_brute',
  checklistVehicules: 'fleet_checklist_vehicules',
  settings: 'fleet_settings',
  conversations: 'fleet_conversations',
  notifications: 'fleet_notifications',
  contraventions: 'fleet_contraventions',
  pushSubscriptions: 'fleet_push_subscriptions',
  depenses: 'fleet_depenses',
  reparations: 'fleet_reparations',
  incidents: 'fleet_incidents',
  taches: 'fleet_taches',
  depenseCategories: 'fleet_depense_categories',
  versementRecurrents: 'fleet_versement_recurrents'
};

// Field name conversion utilities (camelCase ↔ snake_case)
// Special aliases: app fields whose DB column name differs from simple snake_case
const FIELD_TO_DB = { dateCreation: 'created_at' };
const DB_TO_FIELD = { created_at: 'dateCreation' };

function toSnakeCase(str) {
  if (FIELD_TO_DB[str]) return FIELD_TO_DB[str];
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toCamelCase(str) {
  if (DB_TO_FIELD[str]) return DB_TO_FIELD[str];
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function objToSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

function objToCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

function rowsToCamel(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(objToCamel);
}
