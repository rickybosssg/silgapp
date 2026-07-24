import { base44 } from '@/api/base44Client';

export async function logAudit(action, entiteType, entiteId, ancienneValeur, nouvelleValeur, details = '') {
  try {
    const user = await base44.auth.me();
    await base44.entities.VenusAudit.create({
      utilisateur: user?.email || 'unknown',
      action,
      entite_type: entiteType,
      entite_id: entiteId || '',
      ancienne_valeur: ancienneValeur ? JSON.stringify(ancienneValeur) : '',
      nouvelle_valeur: nouvelleValeur ? JSON.stringify(nouvelleValeur) : '',
      details,
    });
  } catch (e) {
    console.error('[venusLearning] Erreur logAudit:', e.message);
  }
}

export async function createKnowledgeVersion(knowledgeId, version, donnees, action) {
  try {
    const user = await base44.auth.me();
    await base44.entities.VenusKnowledgeVersion.create({
      knowledge_id: knowledgeId,
      version,
      donnees: JSON.stringify(donnees),
      auteur: user?.email || 'unknown',
      action,
    });
  } catch (e) {
    console.error('[venusLearning] Erreur createKnowledgeVersion:', e.message);
  }
}

export function exportToCSV(entries, filename = 'venus_knowledge_export.csv') {
  const headers = ['titre', 'categorie', 'question', 'reponse_officielle', 'mots_cles', 'pays', 'ville', 'langue', 'priorite', 'statut'];
  const rows = entries.map(e => headers.map(h => {
    const val = e[h] || '';
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    return `"${str.replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const CATEGORIES = [
  'cas_livraison', 'cas_expedition', 'cas_client', 'cas_livreur',
  'cas_boutique', 'cas_restaurant', 'cas_pharmacie', 'cas_administrateur',
  'procedures', 'faq', 'bonnes_pratiques', 'regles_metier',
  'scripts_conversation',
  'tarifs', 'expedition_colis', 'reception_colis', 'suivi_colis', 'gps',
  'prix_manuel', 'prix_automatique', 'annulation_course', 'paiement',
  'remboursement', 'compte_client', 'compte_livreur', 'inscription',
  'notifications', 'publicites', 'probleme_technique', 'comptabilite',
  'livraison_urgente', 'devenir_livreur', 'questions_generales', 'autres'
];

export const CATEGORY_LABELS = {
  cas_livraison: 'Cas de livraison',
  cas_expedition: 'Cas d\'expédition',
  cas_client: 'Cas Client',
  cas_livreur: 'Cas Livreur',
  cas_boutique: 'Cas Boutique',
  cas_restaurant: 'Cas Restaurant',
  cas_pharmacie: 'Cas Pharmacie',
  cas_administrateur: 'Cas Administrateur',
  procedures: 'Procédures',
  faq: 'FAQ',
  bonnes_pratiques: 'Bonnes pratiques',
  regles_metier: 'Règles métier',
  scripts_conversation: 'Scripts de conversation',
  tarifs: 'Tarifs',
  expedition_colis: 'Expédition colis',
  reception_colis: 'Réception colis',
  suivi_colis: 'Suivi colis',
  gps: 'GPS',
  prix_manuel: 'Prix manuel',
  prix_automatique: 'Prix automatique',
  annulation_course: 'Annulation course',
  paiement: 'Paiement',
  remboursement: 'Remboursement',
  compte_client: 'Compte client',
  compte_livreur: 'Compte livreur',
  inscription: 'Inscription',
  notifications: 'Notifications',
  publicites: 'Publicités',
  probleme_technique: 'Problème technique',
  comptabilite: 'Comptabilité',
  livraison_urgente: 'Livraison urgente',
  devenir_livreur: 'Devenir livreur',
  questions_generales: 'Questions générales',
  autres: 'Autres',
};

export function getCategoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat || 'Autres';
}

export const PAYS_CODES = ['ALL', 'BF', 'CI', 'TG', 'BJ', 'SN', 'ML', 'GN', 'NE', 'GH'];

export const STATUT_LABELS = {
  brouillon: { label: 'Brouillon', color: 'bg-amber-100 text-amber-700' },
  en_revision: { label: 'En révision', color: 'bg-blue-100 text-blue-700' },
  valide: { label: 'Validé', color: 'bg-green-100 text-green-700' },
  archive: { label: 'Archivé', color: 'bg-gray-100 text-gray-500' },
};

export const PRIORITE_LABELS = {
  basse: { label: 'Basse', color: 'bg-gray-100 text-gray-600' },
  normale: { label: 'Normale', color: 'bg-blue-100 text-blue-700' },
  haute: { label: 'Haute', color: 'bg-orange-100 text-orange-700' },
  critique: { label: 'Critique', color: 'bg-red-100 text-red-700' },
};