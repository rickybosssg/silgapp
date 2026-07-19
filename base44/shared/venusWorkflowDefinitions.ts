/**
 * ═══════════════════════════════════════════════════════════════
 *  MOTEUR DES WORKFLOWS MÉTIER DE VENUS — Définitions des 12 workflows
 * ═══════════════════════════════════════════════════════════════
 *
 *  Ces définitions sont des DONNÉES (pas de logique).
 *  Le moteur d'exécution (venusWorkflowEngine.ts) les interprète.
 *  Les workflows sont totalement indépendants de l'IA :
 *  VENUS décide quel workflow lancer, le moteur exécute les étapes.
 */

// ── Helpers pour construire les étapes concisément ──
function collect(id, champ, question, prochaine, opts = {}) {
  return { id, type: 'collecter_info', champ, question, obligatoire: opts.obligatoire !== false, ...opts, prochaine_etape: prochaine };
}
function action(id, act, libelle, prochaine, params = {}) {
  return { id, type: 'action', action: act, libelle, parametres: params, prochaine_etape: prochaine };
}
function notif(id, message, prochaine) {
  return { id, type: 'notification', message, prochaine_etape: prochaine };
}
function attente(id, evenement, prochaine, timeout = 10, onTimeout = null) {
  return { id, type: 'attente_evenement', evenement, timeout_minutes: timeout, prochaine_etape: prochaine, on_timeout: onTimeout };
}
function cond(id, champ, operateur, valeur, siVrai, siFaux) {
  return { id, type: 'condition', condition: { champ, operateur, valeur }, etape_si_vrai: siVrai, etape_si_faux: siFaux };
}
function sousWf(id, workflowCode, prochaine) {
  return { id, type: 'sous_workflow', workflow_code: workflowCode, prochaine_etape: prochaine };
}
function fin(id, message = 'Workflow terminé. N\'hésitez pas à me solliciter si besoin.') {
  return { id, type: 'fin', message };
}

// ── Gestion des exceptions commune ──
const EXCEPTIONS_COMMUNES = {
  livreur_annule: {
    action: 'relancer_dispatch',
    message: 'Le livreur précédent a annulé. Je lance immédiatement la recherche d\'un nouveau livreur pour votre course.',
  },
  client_annule: {
    action: 'annuler_course',
    message: 'Votre course a été annulée comme demandé. N\'hésitez pas à me solliciter pour une nouvelle demande.',
  },
  gps_absent: {
    action: 'demander_quartier',
    message: 'Je n\'ai pas pu obtenir votre position GPS. Pouvez-vous m\'indiquer votre quartier ou une adresse précise ?',
  },
  reseau_perdu: {
    action: 'reessayer',
    message: 'Une erreur réseau est survenue. Je réessaie automatiquement. Veuillez patienter quelques instants.',
  },
  paiement_echoue: {
    action: 'proposer_alternative_paiement',
    message: 'Le paiement a échoué. Vous pouvez réessayer ou utiliser un autre moyen de paiement.',
  },
  qr_invalide: {
    action: 'generer_nouveau_qr',
    message: 'Le QR code semble invalide. Je génère un nouveau QR code et code PIN pour vous.',
  },
  pin_incorrect: {
    action: 'generer_nouveau_pin',
    message: 'Le code PIN est incorrect. Je vous envoie un nouveau code PIN.',
  },
  course_expiree: {
    action: 'proposer_redispatch',
    message: 'Le délai de recherche de livreur a expiré. Souhaitez-vous que je relance la recherche ? Répondez « oui » ou « non ».',
  },
  partenaire_indisponible: {
    action: 'notifier_indisponibilite',
    message: 'Le partenaire sélectionné est actuellement indisponible. Vous pouvez choisir un autre partenaire ou créer une course classique.',
  },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 1 : Création d'une course
// ═══════════════════════════════════════════════════════════════
const WF_CREER_COURSE = {
  code: 'creer_course',
  nom: 'Création d\'une course',
  description: 'Guide le client jusqu\'à la création complète de la course',
  categorie: 'course',
  declencheur: 'creer_course',
  etapes: [
    collect('s1_type', 'type_course', 'Quel type de course souhaitez-vous ?\n1. Envoyer un colis\n2. Recevoir un colis\n3. Me déplacer\n\nRépondez par le numéro ou le type.', 's2_depart', { options: ['expedier', 'recevoir', 'deplacement'] }),
    collect('s2_depart', 'adresse_depart', 'Quel est le lieu de récupération ? (quartier, adresse, ou partagez votre localisation GPS)', 's3_arrivee'),
    collect('s3_arrivee', 'adresse_arrivee', 'Quel est le lieu de livraison ? (quartier, adresse, ou partagez une localisation)', 's4_tel_dest'),
    collect('s4_tel_dest', 'telephone_destinataire', 'Quel est le numéro de téléphone du destinataire ? (Si vous ne le connaissez pas, répondez « je ne sais pas »)', 's5_type_colis', { obligatoire: false }),
    collect('s5_type_colis', 'type_colis', 'Quel type de colis ? (petit colis, moyen colis, gros colis, document, nourriture, ou autre)', 's6_delai', { obligatoire: false, options: ['petit_colis', 'moyen_colis', 'gros_colis', 'document', 'nourriture', 'autre'] }),
    collect('s6_delai', 'livraison_immediate', 'Souhaitez-vous une livraison immédiate ou programmée ? (répondez « immédiate » ou « programmée »)', 's7_prog', { options: ['immediate', 'programmee'] }),
    cond('s7_prog', 'livraison_immediate', 'equals', 'programmee', 's7b_date', 's8_remarques'),
    collect('s7b_date', 'date_souhaitee', 'Pour quelle date et heure souhaitez-vous la course ? (ex: 25/07/2026 à 14h00)', 's8_remarques'),
    collect('s8_remarques', 'remarques', 'Avez-vous des remarques particulières ? (instructions spéciales, fragilité, etc. Si rien, répondez « non »)', 's9_resume', { obligatoire: false }),
    notif('s9_resume', 'Voici le récapitulatif de votre demande :\n\n{__resume__}\n\nConfirmez-vous la création de cette course ? Répondez « oui » pour confirmer.', 's10_confirme'),
    collect('s10_confirme', 'confirme', '', 's11_creer', { obligatoire: true }),
    action('s11_creer', 'creer_course', 'Création de la course dans SILGAPP', 's12_notif'),
    notif('s12_notif', 'Votre course a été créée avec succès ! Je recherche maintenant un livreur disponible. Je vous informerai dès qu\'un livreur aura accepté.', 's13_sous_wf'),
    sousWf('s13_sous_wf', 'recherche_livreur', 'fin'),
    fin('fin'),
  ],
  gestion_erreurs: EXCEPTIONS_COMMUNES,
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 2 : Recherche de livreur
// ═══════════════════════════════════════════════════════════════
const WF_RECHERCHE_LIVREUR = {
  code: 'recherche_livreur',
  nom: 'Recherche de livreur',
  description: 'Lance la recherche, informe le client, suit l\'évolution',
  categorie: 'livraison',
  declencheur: 'recherche_livreur',
  etapes: [
    action('r1_lancer', 'lancer_dispatch', 'Lancement du dispatch automatique', 'r2_notif'),
    notif('r2_notif', 'Je lance la recherche d\'un livreur disponible dans votre secteur. Patientez un instant, je vous tiens informé.', 'r3_attente'),
    attente('r3_attente', 'livreur_accepte', 'r4_notif', 10, 'r_timeout'),
    notif('r4_notif', 'Un livreur a accepté votre course ! Je vous envoie les détails.', 'r5_sous_wf'),
    sousWf('r5_sous_wf', 'affectation', 'fin'),
    notif('r_timeout', 'Le délai de recherche a expiré. Je relance la recherche avec un nouveau cycle de livreurs.', 'r1_lancer'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 3 : Affectation
// ═══════════════════════════════════════════════════════════════
const WF_AFFECTATION = {
  code: 'affectation',
  nom: 'Affectation du livreur',
  description: 'Envoie automatiquement les informations du livreur au client',
  categorie: 'livraison',
  declencheur: 'livreur_affecte',
  etapes: [
    action('a1_info', 'envoyer_info_livreur', 'Envoi des informations du livreur', 'a2_qr'),
    notif('a2_notif', '{__info_livreur__}', 'a2_qr'),
    action('a2_qr', 'envoyer_qr_pin', 'Génération et envoi du QR Code et code PIN', 'a3_notif'),
    notif('a3_notif', 'Voici votre QR Code officiel et votre code PIN de récupération :\n\nCode PIN : {__pin__}\nQR Code : {__qr_url__}\n\n⚠️ Ne communiquez le QR Code et le PIN qu\'au livreur au moment de la récupération du colis.', 'a4_attente'),
    attente('a4_attente', 'livreur_arrive', 'a5_notif', 60, 'fin'),
    notif('a5_notif', 'Votre livreur est arrivé au point de prise en charge. Veuillez lui remettre le colis et communiquer le QR Code / PIN pour validation.', 'a6_sous_wf'),
    sousWf('a6_sous_wf', 'recuperation', 'fin'),
    fin('fin', 'Le livreur est en route. Je vous tiendrai informé de l\'avancement.'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 4 : Récupération
// ═══════════════════════════════════════════════════════════════
const WF_RECUPERATION = {
  code: 'recuperation',
  nom: 'Récupération du colis',
  description: 'Rappel du QR/PIN et confirmation de récupération',
  categorie: 'livraison',
  declencheur: 'livreur_arrive',
  etapes: [
    notif('rc1_rappel', '⚠️ Rappel important : ne communiquez le QR Code et le code PIN qu\'au moment de la récupération du colis, directement au livreur.', 'rc2_attente'),
    attente('rc2_attente', 'colis_recupere', 'rc3_notif', 120, 'rc_timeout'),
    notif('rc3_notif', '✅ Votre colis a été récupéré avec succès par le livreur. La livraison est maintenant en cours.', 'rc4_sous_wf'),
    sousWf('rc4_sous_wf', 'livraison', 'fin'),
    notif('rc_timeout', 'La récupération n\'a pas encore été validée. Si le livreur est présent, communiquez-lui le QR Code et le PIN.', 'rc2_attente'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES, qr_invalide: { ...EXCEPTIONS_COMMUNES.qr_invalide }, pin_incorrect: { ...EXCEPTIONS_COMMUNES.pin_incorrect } },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 5 : Livraison
// ═══════════════════════════════════════════════════════════════
const WF_LIVRAISON = {
  code: 'livraison',
  nom: 'Livraison du colis',
  description: 'Informations pendant le trajet et confirmation de livraison',
  categorie: 'livraison',
  declencheur: 'colis_recupere',
  etapes: [
    notif('l1_notif', 'Votre livreur est en route vers la destination. Vous pouvez suivre sa position en temps réel : {__tracking_link__}', 'l2_attente'),
    attente('l2_attente', 'arrivee_proche', 'l3_notif', 30, 'l3_attente'),
    notif('l3_notif', 'Votre livreur arrive bientôt à destination !', 'l3_attente'),
    attente('l3_attente', 'colis_livre', 'l4_notif', 120, 'l_timeout'),
    notif('l4_notif', '✅ Votre colis a bien été livré avec succès ! Merci d\'utiliser SILGAPP.', 'l5_sous_wf'),
    sousWf('l5_sous_wf', 'paiement', 'fin'),
    notif('l_timeout', 'La livraison prend plus de temps que prévu. Je vérifie le statut.', 'l3_attente'),
    fin('fin', 'Livraison en cours. Je vous informerai à chaque étape.'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 6 : Paiement
// ═══════════════════════════════════════════════════════════════
const WF_PAIEMENT = {
  code: 'paiement',
  nom: 'Paiement de la course',
  description: 'Annonce du montant, moyens de paiement, confirmation et reçu',
  categorie: 'paiement',
  declencheur: 'demander_paiement',
  etapes: [
    action('p1_prix', 'annoncer_prix', 'Récupération du montant officiel', 'p2_notif'),
    notif('p2_notif', 'Le montant de votre course est de {__montant__} {__devise__}.', 'p3_moyens'),
    notif('p3_moyens', 'Moyens de paiement disponibles :\n• Espèces (à remettre au livreur)\n• Orange Money\n• Moov Money\n• Wave\n\nIndiquez votre moyen de paiement préféré.', 'p4_attente'),
    attente('p4_attente', 'paiement_confirme', 'p5_recu', 30, 'p4_attente'),
    action('p5_recu', 'envoyer_recu', 'Génération et envoi du reçu', 'p6_fin'),
    notif('p6_fin', '✅ Paiement confirmé. Merci ! Votre reçu vous a été envoyé. N\'hésitez pas à noter votre livreur et à utiliser SILGAPP à nouveau.', 'fin'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES, paiement_echoue: { ...EXCEPTIONS_COMMUNES.paiement_echoue } },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 7 : Pharmacie
// ═══════════════════════════════════════════════════════════════
const WF_PHARMACIE = {
  code: 'pharmacie',
  nom: 'Livraison pharmacie',
  description: 'Gestion complète : ordonnance, validation, préparation, livraison',
  categorie: 'partenaire',
  declencheur: 'commande_pharmacie',
  etapes: [
    collect('ph1_pharma', 'pharmacie_id', 'Quelle pharmacie souhaitez-vous contacter ? (Indiquez le nom ou partagez votre position pour trouver la pharmacie la plus proche)', 'ph2_ordo'),
    collect('ph2_ordo', 'has_ordonnance', 'Avez-vous une ordonnance à transmettre ? (répondez « oui » ou « non »)', 'ph3_upload', { options: ['oui', 'non'] }),
    cond('ph3_upload', 'has_ordonnance', 'equals', 'oui', 'ph3b_photo', 'ph4_meds'),
    collect('ph3b_photo', 'ordonnance_photo', 'Veuillez photographier votre ordonnance et l\'envoyer ici.', 'ph4_meds'),
    collect('ph4_meds', 'medicaments', 'Quels médicaments souhaitez-vous commander ? (Listez les noms, ou indiquez « selon ordonnance »)', 'ph5_valider'),
    action('ph5_valider', 'valider_pharmacie', 'Transmission de la commande à la pharmacie', 'ph6_attente_val'),
    notif('ph6_notif', 'Votre commande a été transmise à la pharmacie. Elle va confirmer la disponibilité des médicaments.', 'ph6_attente_val'),
    attente('ph6_attente_val', 'pharmacie_validee', 'ph7_prep', 30, 'ph_timeout_val'),
    notif('ph7_notif', '✅ La pharmacie a confirmé votre commande. Préparation en cours.', 'ph7_prep'),
    attente('ph7_prep', 'preparation_terminee', 'ph8_dispatch', 60, 'ph_timeout_prep'),
    notif('ph8_notif', 'Votre commande est prête ! Je lance la recherche d\'un livreur.', 'ph8_dispatch'),
    action('ph8_dispatch', 'creer_course_pharmacie', 'Création de la course de livraison pharmacie', 'ph9_sous_wf'),
    sousWf('ph9_sous_wf', 'recherche_livreur', 'fin'),
    notif('ph_timeout_val', 'La pharmacie n\'a pas encore confirmé. Je relance la vérification.', 'ph6_attente_val'),
    notif('ph_timeout_prep', 'La préparation prend plus de temps que prévu. Je vérifie le statut.', 'ph7_prep'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES, partenaire_indisponible: { ...EXCEPTIONS_COMMUNES.partenaire_indisponible } },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 8 : Restaurant
// ═══════════════════════════════════════════════════════════════
const WF_RESTAURANT = {
  code: 'restaurant',
  nom: 'Livraison restaurant',
  description: 'Commande, validation, préparation, recherche livreur, livraison',
  categorie: 'partenaire',
  declencheur: 'commande_restaurant',
  etapes: [
    collect('re1_resto', 'restaurant_id', 'Quel restaurant souhaitez-vous ? (Indiquez le nom ou le type de cuisine)', 're2_menu'),
    action('re2_menu', 'afficher_menu', 'Récupération du menu du restaurant', 're3_notif_menu'),
    notif('re3_notif_menu', 'Voici le menu disponible :\n{__menu__}\n\nQue souhaitez-vous commander ?', 're4_commande'),
    collect('re4_commande', 'commande_details', 'Quels plats souhaitez-vous commander ? (Listez les plats avec les quantités)', 're5_valider'),
    action('re5_valider', 'creer_commande_restaurant', 'Transmission de la commande au restaurant', 're6_attente_val'),
    notif('re6_notif', 'Votre commande a été transmise au restaurant. Confirmation en cours...', 're6_attente_val'),
    attente('re6_attente_val', 'restaurant_valide', 're7_prep', 20, 're_timeout_val'),
    notif('re7_notif', '✅ Le restaurant a confirmé votre commande. Préparation en cours. Temps estimé : {__temps_prep__} minutes.', 're7_prep'),
    attente('re7_prep', 'preparation_terminee', 're8_dispatch', 60, 're_timeout_prep'),
    notif('re8_notif', 'Votre commande est prête ! Je lance la recherche d\'un livreur.', 're8_dispatch'),
    action('re8_dispatch', 'creer_course_restaurant', 'Création de la course de livraison restaurant', 're9_sous_wf'),
    sousWf('re9_sous_wf', 'recherche_livreur', 'fin'),
    notif('re_timeout_val', 'Le restaurant n\'a pas encore confirmé. Je relance la vérification.', 're6_attente_val'),
    notif('re_timeout_prep', 'La préparation prend plus de temps que prévu. Je vérifie le statut.', 're7_prep'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES, partenaire_indisponible: { ...EXCEPTIONS_COMMUNES.partenaire_indisponible } },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 9 : Boutique
// ═══════════════════════════════════════════════════════════════
const WF_BOUTIQUE = {
  code: 'boutique',
  nom: 'Livraison boutique',
  description: 'Commande, validation, expédition, livraison',
  categorie: 'partenaire',
  declencheur: 'commande_boutique',
  etapes: [
    collect('b1_bout', 'boutique_id', 'Quelle boutique souhaitez-vous ? (Indiquez le nom ou la catégorie de produits)', 'b2_produits'),
    action('b2_prod', 'afficher_produits', 'Récupération des produits de la boutique', 'b3_notif_prod'),
    notif('b3_notif_prod', 'Voici les produits disponibles :\n{__produits__}\n\nQue souhaitez-vous commander ?', 'b4_commande'),
    collect('b4_commande', 'commande_details', 'Quels produits souhaitez-vous commander ? (Listez les produits avec les quantités)', 'b5_valider'),
    action('b5_valider', 'creer_commande_boutique', 'Transmission de la commande à la boutique', 'b6_attente_val'),
    notif('b6_notif', 'Votre commande a été transmise à la boutique. Confirmation en cours...', 'b6_attente_val'),
    attente('b6_attente_val', 'boutique_valide', 'b7_prep', 20, 'b_timeout_val'),
    notif('b7_notif', '✅ La boutique a confirmé votre commande. Préparation en cours.', 'b7_prep'),
    attente('b7_prep', 'preparation_terminee', 'b8_dispatch', 45, 'b_timeout_prep'),
    notif('b8_notif', 'Votre commande est prête ! Je lance la recherche d\'un livreur.', 'b8_dispatch'),
    action('b8_dispatch', 'creer_course_boutique', 'Création de la course de livraison boutique', 'b9_sous_wf'),
    sousWf('b9_sous_wf', 'recherche_livreur', 'fin'),
    notif('b_timeout_val', 'La boutique n\'a pas encore confirmé. Je relance la vérification.', 'b6_attente_val'),
    notif('b_timeout_prep', 'La préparation prend plus de temps que prévu. Je vérifie le statut.', 'b7_prep'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES, partenaire_indisponible: { ...EXCEPTIONS_COMMUNES.partenaire_indisponible } },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 10 : Livraison programmée
// ═══════════════════════════════════════════════════════════════
const WF_PROGRAMMEE = {
  code: 'livraison_programmee',
  nom: 'Livraison programmée',
  description: 'Gestion complète : date, heure, rappels, démarrage automatique',
  categorie: 'programmation',
  declencheur: 'course_programmee',
  etapes: [
    collect('pr1_type', 'type_course', 'Quel type de course souhaitez-vous programmer ?\n1. Envoyer un colis\n2. Recevoir un colis\n3. Me déplacer', 'pr2_date', { options: ['expedier', 'recevoir', 'deplacement'] }),
    collect('pr2_date', 'date_souhaitee', 'Pour quelle date et heure souhaitez-vous programmer la course ? (ex: 25/07/2026 à 14h00)', 'pr3_depart'),
    collect('pr3_depart', 'adresse_depart', 'Quel est le lieu de récupération ?', 'pr4_arrivee'),
    collect('pr4_arrivee', 'adresse_arrivee', 'Quel est le lieu de livraison ?', 'pr5_tel'),
    collect('pr5_tel', 'telephone_destinataire', 'Quel est le numéro de téléphone du destinataire ?', 'pr6_resume'),
    notif('pr6_resume', 'Voici le récapitulatif de votre course programmée :\n\n{__resume__}\n\nConfirmez-vous ? Répondez « oui » pour confirmer.', 'pr7_confirme'),
    collect('pr7_confirme', 'confirme', '', 'pr8_creer', { obligatoire: true }),
    action('pr8_creer', 'creer_course_programmee', 'Création de la course programmée', 'pr9_notif'),
    notif('pr9_notif', '✅ Votre course a été programmée pour le {__date_formatee__}. Vous recevrez un rappel 1 heure avant, puis 15 minutes avant le départ.', 'pr10_rappel_1h'),
    attente('pr10_rappel_1h', 'rappel_1h', 'pr11_notif_1h', 1440, 'pr10_rappel_1h'),
    notif('pr11_notif_1h', '⏰ Rappel : votre course programmée débute dans 1 heure. Le livreur sera recherché automatiquement.', 'pr12_rappel_15'),
    attente('pr12_rappel_15', 'rappel_15min', 'pr13_notif_15', 45, 'pr12_rappel_15'),
    notif('pr13_notif_15', '⏰ Votre course débute dans 15 minutes. Je lance la recherche d\'un livreur dès maintenant.', 'pr14_dispatch'),
    action('pr14_dispatch', 'lancer_dispatch', 'Lancement du dispatch pour la course programmée', 'pr15_sous_wf'),
    sousWf('pr15_sous_wf', 'recherche_livreur', 'fin'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 11 : Réclamation
// ═══════════════════════════════════════════════════════════════
const WF_RECLAMATION = {
  code: 'reclamation',
  nom: 'Réclamation',
  description: 'Identifier le problème, créer une réclamation, transmettre au support',
  categorie: 'support',
  declencheur: 'faire_reclamation',
  etapes: [
    collect('rc1_type', 'type_probleme', 'Quel est le type de problème ?\n1. Livreur en retard\n2. Colis endommagé\n3. Colis non livré\n4. Comportement du livreur\n5. Problème de paiement\n6. Autre\n\nRépondez par le numéro.', 'rc2_desc', { options: ['retard', 'endommage', 'non_livre', 'comportement', 'paiement', 'autre'] }),
    collect('rc2_desc', 'description', 'Décrivez le problème en détail. (Que s\'est-il passé ?)', 'rc3_course'),
    collect('rc3_course', 'course_id', 'Avez-vous un numéro de course ? (Si oui, indiquez-le. Sinon, répondez « non »)', 'rc4_creer', { obligatoire: false }),
    action('rc4_creer', 'creer_reclamation', 'Création automatique de la réclamation', 'rc5_transmettre'),
    action('rc5_transmettre', 'transmettre_support', 'Transmission au support SILGAPP', 'rc6_notif'),
    notif('rc6_notif', '✅ Votre réclamation a été créée et transmise au support SILGAPP.\n\nNuméro de ticket : {__ticket_id__}\n\nNotre équipe vous recontactera dans les plus brefs délais. Vous pouvez suivre l\'évolution de votre réclamation ici.', 'rc7_attente'),
    attente('rc7_attente', 'reclamation_resolue', 'rc8_notif', 1440, 'fin'),
    notif('rc8_notif', '✅ Votre réclamation a été traitée et résolue. Merci pour votre patience et votre retour qui nous aide à améliorer SILGAPP.', 'fin'),
    fin('fin'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES },
};

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW 12 : Contacter le livreur
// ═══════════════════════════════════════════════════════════════
const WF_CONTACTER_LIVREUR = {
  code: 'contacter_livreur',
  nom: 'Contacter le livreur',
  description: 'Permet au client d\'appeler, envoyer un message ou localiser le livreur',
  categorie: 'communication',
  declencheur: 'contacter_livreur',
  etapes: [
    action('cl1_trouver', 'trouver_course_active', 'Recherche de la course active', 'cl2_cond'),
    cond('cl2_cond', 'has_livreur', 'equals', true, 'cl3_info', 'cl4_no_livreur'),
    action('cl3_info', 'envoyer_contact_livreur', 'Envoi des coordonnées du livreur', 'cl3b_notif'),
    notif('cl3b_notif', '🧑‍✈️ Votre livreur : {__livreur_nom__}\n📞 Téléphone : {__livreur_tel__}\n🚗 Véhicule : {__livreur_vehicule__}\n\nVous pouvez :\n1. Appeler le livreur au numéro ci-dessus\n2. Écrire un message ici — je le transmettrai au livreur\n3. Suivre la position : {__tracking_link__}\n\nÉcrivez votre message ou dites « fin » pour terminer.', 'cl4_attente'),
    attente('cl4_attente', 'fin_contact', 'fin', 30, 'fin'),
    notif('cl4_no_livreur', 'Je ne trouve pas de course active avec un livreur assigné pour le moment. Si vous souhaitez créer une nouvelle course, dites-le moi !', 'fin'),
    fin('fin', 'Conversation avec le livreur terminée. N\'hésitez pas si vous avez besoin d\'autre chose.'),
  ],
  gestion_erreurs: { ...EXCEPTIONS_COMMUNES },
};

// ═══════════════════════════════════════════════════════════════
//  Export de tous les workflows
// ═══════════════════════════════════════════════════════════════
export const WORKFLOW_DEFINITIONS = [
  WF_CREER_COURSE,
  WF_RECHERCHE_LIVREUR,
  WF_AFFECTATION,
  WF_RECUPERATION,
  WF_LIVRAISON,
  WF_PAIEMENT,
  WF_PHARMACIE,
  WF_RESTAURANT,
  WF_BOUTIQUE,
  WF_PROGRAMMEE,
  WF_RECLAMATION,
  WF_CONTACTER_LIVREUR,
];

export const EXCEPTIONS_DEFINITIONS = EXCEPTIONS_COMMUNES;

// Mapping intention VENUS → code de workflow
export const INTENTION_TO_WORKFLOW: Record<string, string> = {
  creer_course: 'creer_course',
  suivre_course: 'contacter_livreur',
  contacter_livreur: 'contacter_livreur',
  annuler_course: 'reclamation',
  faire_reclamation: 'reclamation',
  commande_pharmacie: 'pharmacie',
  commande_restaurant: 'restaurant',
  commande_boutique: 'boutique',
  course_programmee: 'livraison_programmee',
  demander_paiement: 'paiement',
};