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
  'tarifs', 'expedition_colis', 'reception_colis', 'suivi_colis', 'gps',
  'prix_manuel', 'prix_automatique', 'annulation_course', 'paiement',
  'remboursement', 'compte_client', 'compte_livreur', 'inscription',
  'notifications', 'publicites', 'probleme_technique', 'comptabilite',
  'livraison_urgente', 'devenir_livreur', 'questions_generales', 'autres'
];

export const PAYS_CODES = ['ALL', 'BF', 'CI', 'TG', 'BJ', 'SN', 'ML', 'GN', 'NE', 'GH'];

export const STATUT_LABELS = {
  brouillon: { label: 'Brouillon', color: 'bg-amber-100 text-amber-700' },
  valide: { label: 'Validé', color: 'bg-green-100 text-green-700' },
  archive: { label: 'Archivé', color: 'bg-gray-100 text-gray-500' },
};

export const PRIORITE_LABELS = {
  basse: { label: 'Basse', color: 'bg-gray-100 text-gray-600' },
  normale: { label: 'Normale', color: 'bg-blue-100 text-blue-700' },
  haute: { label: 'Haute', color: 'bg-orange-100 text-orange-700' },
  critique: { label: 'Critique', color: 'bg-red-100 text-red-700' },
};