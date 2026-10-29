export function parcelProgressIndex(statut, contactedAt) {
  if (statut === 'livree') return 3;
  if (['colis_recupere', 'en_livraison', 'arrivee'].includes(statut)) return 2;
  if (['client_contacte', 'en_route_expediteur', 'arrive_prise_en_charge'].includes(statut)) return 1;
  if (statut === 'livreur_en_route' && contactedAt) return 1;
  return 0;
}
