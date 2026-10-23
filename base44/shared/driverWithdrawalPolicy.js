export const DRIVER_ACTIVE_STATUSES = ['livreur_en_route','client_contacte','en_route_expediteur','arrive_prise_en_charge','colis_recupere','passager_embarque','pris_en_charge','en_livraison','arrivee'];
export const DRIVER_PRE_PICKUP_STATUSES = DRIVER_ACTIVE_STATUSES.slice(0, 4);
/** @type {Record<string, string>} */
export const DRIVER_WITHDRAWAL_REASONS = {
  client_injoignable:'Client injoignable',client_change_avis:"Client a changé d'avis",mauvaise_adresse:'Mauvaise adresse',colis_inexistant:'Colis inexistant',colis_pas_pret:'Colis pas prêt',panne_vehicule:'Panne du véhicule',batterie_dechargee:'Batterie déchargée',course_trop_loin:'Course trop loin',prix_insuffisant:'Prix insuffisant',autre_course_conflit_planning:'Conflit de planning',probleme_personnel:'Problème personnel',acceptation_erreur:'Acceptation par erreur',accident:'Accident',colis_interdit:'Colis interdit','désaccord_prix':'Désaccord sur le prix',autre:'Autre',
};
export const driverHasCustody = course => !!(course?.heure_recuperation || course?.pickup_confirmed_at) || ['colis_recupere','passager_embarque','pris_en_charge','en_livraison','arrivee','livree'].includes(course?.statut);
