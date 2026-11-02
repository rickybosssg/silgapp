export function forteDemandeView(country) {
  const enabled = !!country?.forte_demande_client_actif;
  return {
    active: enabled && !!country?.forte_demande_active,
    config: {
      actif: enabled,
      seuil_activation: country?.forte_demande_seuil_activation || 5,
      seuil_retour: country?.forte_demande_seuil_retour || 3,
      titre: country?.forte_demande_titre || '🔥 FORTE DEMANDE EN COURS',
      message: country?.forte_demande_message || 'Plusieurs commandes sont en cours. Proposez un prix attractif pour augmenter vos chances de trouver rapidement un livreur.',
    },
  };
}
