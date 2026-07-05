// ── Système de secours VENUS — Réponses locales sans IA ──
// Utilisé quand l'agent IA est indisponible (crédits épuisés, timeout, erreur API)
// Réponses adaptées au pays actif de l'utilisateur

const PAYS_INFOS = {
  BF: { nom: "Burkina Faso", emoji: "🇧🇫", ville: "Ouagadougou", indicatif: "+226", devise: "FCFA", prix_km: 100, minimum: 1000, rayon: 30 },
  CI: { nom: "Côte d'Ivoire", emoji: "🇨🇮", ville: "Abidjan", indicatif: "+225", devise: "FCFA", prix_km: 120, minimum: 1000, rayon: 40 },
  TG: { nom: "Togo", emoji: "🇹🇬", ville: "Lomé", indicatif: "+228", devise: "FCFA", prix_km: 100, minimum: 1000, rayon: 25 },
  BJ: { nom: "Bénin", emoji: "🇧🇯", ville: "Cotonou", indicatif: "+229", devise: "FCFA", prix_km: 100, minimum: 1000, rayon: 25 },
  SN: { nom: "Sénégal", emoji: "🇸🇳", ville: "Dakar", indicatif: "+221", devise: "FCFA", prix_km: 150, minimum: 1000, rayon: 35 },
  ML: { nom: "Mali", emoji: "🇲🇱", ville: "Bamako", indicatif: "+223", devise: "FCFA", prix_km: 100, minimum: 1000, rayon: 30 },
  GN: { nom: "Guinée", emoji: "🇬🇳", ville: "Conakry", indicatif: "+224", devise: "GNF", prix_km: 800, minimum: 4000, rayon: 30 },
  NE: { nom: "Niger", emoji: "🇳🇪", ville: "Niamey", indicatif: "+227", devise: "FCFA", prix_km: 100, minimum: 1000, rayon: 25 },
  GH: { nom: "Ghana", emoji: "🇬🇭", ville: "Accra", indicatif: "+233", devise: "GHS", prix_km: 2, minimum: 10, rayon: 30 },
};

const SUPPORT_PHONE = "+226 66 92 51 90";

function getPaysInfo(countryContext) {
  if (!countryContext?.code) return PAYS_INFOS.BF;
  return PAYS_INFOS[countryContext.code] || {
    ...PAYS_INFOS.BF,
    nom: countryContext.nom || countryContext.code,
    devise: countryContext.devise || "FCFA",
    prix_km: countryContext.prix_par_km || 100,
    minimum: countryContext.prix_minimum || 1000,
    ville: countryContext.ville || "",
    indicatif: countryContext.indicatif || "+226",
  };
}

// Normaliser le texte pour la détection (minuscules, sans accents)
function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Détecter l'intention de la question
function detectIntent(question) {
  const q = normalize(question);
  if (!q) return "default";

  // Salutations
  if (/^(bonjour|salut|bonsoir|hello|hi|coucou|cc|bonjour venus|salut venus)/.test(q) || q.length < 5) return "greeting";

  // Qu'est-ce que SILGAPP
  if (/(qu.?est.?ce|c.?est quoi|presentation|presente|qui est|parle moi|a propos|apropos|silgapp)/.test(q) && /silgapp/.test(q)) return "about_silgapp";
  if (/^(c.?est quoi|qu.?est.?ce|presentation|presente|a propos|apropos)/.test(q)) return "about_silgapp";

  // Créer une course
  if (/(creer|creer une course|commander|demander|expedier|envoyer un colis|recevoir|deplacement|course|livraison|comment faire)/.test(q)) return "create_course";

  // Tarifs
  if (/(tarif|prix|cout|combien|coute|cher|paye|payer|montant|facturation|frais)/.test(q)) return "pricing";

  // Support
  if (/(support|contacter|contact|aide|whatsapp|numero|telephone|appeler|joindre|help)/.test(q)) return "support";

  // Code promo / parrainage
  if (/(code promo|promo|parrain|parrainage|filleul|reduction|cadeau|bonus)/.test(q)) return "promo";

  // QR code / PIN
  if (/(qr code|qr|code pin|pin|code de recuperation|code de livraison|scanner|scan)/.test(q)) return "qr_pin";

  // Devenir livreur
  if (/(devenir livreur|livreur|chauffeur|conducteur|s.?inscrire|inscription|rejoindre|travail|emploi)/.test(q)) return "become_driver";

  // Suivi de course
  if (/(suivi|suivre|tracking|ou est|localiser|position|temps|estime|arrivee|map|carte)/.test(q)) return "tracking";

  // Multi-colis
  if (/(multi.?colis|plusieurs colis|plusieurs paquets|groupe|lot)/.test(q)) return "multi_colis";

  // Annulation
  if (/(annuler|annulation|refuser|refus|desol|desolee|desole)/.test(q)) return "cancellation";

  // Pays disponibles
  if (/(pays|disponible|disponibilite|ville|region|couverture|ou se trouve)/.test(q)) return "countries";

  // Compte / inscription
  if (/(compte|inscrip|profil|donnee|information personnelle|parametre)/.test(q)) return "account";

  // Default
  return "default";
}

// Générer la réponse selon l'intention et le pays
export function getVenusFallbackResponse(question, countryContext) {
  const pays = getPaysInfo(countryContext);
  const intent = detectIntent(question);

  switch (intent) {
    case "greeting":
      return `Bonjour 👋 Je suis **VENUS**, votre assistante **SILGAPP** pour **${pays.nom}** ${pays.emoji}\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\n🌍 **Pays actif : ${pays.nom}**\n📍 **Ville : ${pays.ville}**\n\nJe peux vous aider à :\n• Créer une course (expédier / recevoir / déplacement)\n• Connaître les tarifs\n• Suivre votre livraison\n• Utiliser les QR codes et codes PIN\n• Contacter le support\n\n**Comment puis-je vous aider ?**`;

    case "about_silgapp":
      return `**SILGAPP** est une plateforme de livraison et de transport disponible à **${pays.ville}** ${pays.emoji} et dans plusieurs pays d'Afrique de l'Ouest.\n\n🚚 **Nos services :**\n• **Expédier un colis** — Envoyez un colis à un destinataire\n• **Recevoir un colis** — Récupérez un colis envoyé vers vous\n• **Déplacement** — Demandez un transport personnel\n\n✨ **Pourquoi SILGAPP ?**\n• Livreurs vérifiés et notés\n• Suivi GPS en temps réel\n• QR codes sécurisés pour la récupération et la livraison\n• Prix calculé automatiquement selon la distance\n• Paiement Mobile Money (Orange Money, etc.)\n• Service client disponible au **${SUPPORT_PHONE}**\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\n**Souhaitez-vous créer une course ?**`;

    case "create_course":
      return `📦 **Créer une course sur SILGAPP** — Voici comment faire :\n\n**1️⃣ Choisissez le type de course :**\n• **Expédier** — Envoyer un colis à quelqu'un\n• **Recevoir** — Récupérer un colis qu'on vous envoie\n• **Déplacement** — Transport personnel\n\n**2️⃣ Renseignez les adresses :**\n• Adresse de départ (GPS automatique ou saisie manuelle)\n• Adresse d'arrivée\n• Vous pouvez aussi sélectionner un quartier\n\n**3️⃣ Validez la commande :**\n• Le prix est calculé automatiquement selon la distance\n• Prix minimum : **${pays.minimum} ${pays.devise}**\n• Prix au km : **${pays.prix_km} ${pays.devise}/km**\n\n**4️⃣ Un livreur est assigné :**\n• Vous voyez sa photo, son nom et sa note\n• Suivez sa position GPS en temps réel\n• Validez la récupération avec le **QR code** ou le **code PIN**\n\n**5️⃣ Paiement :**\n• Payez le livreur en Mobile Money ou espèces\n\n📍 **Service disponible à ${pays.ville} et dans un rayon de ${pays.rayon} km**\n\n**Souhaitez-vous créer une course maintenant ?**`;

    case "pricing":
      return `💰 **Tarifs SILGAPP — ${pays.nom}** ${pays.emoji}\n\n📍 **Ville principale :** ${pays.ville}\n📏 **Rayon de service :** ${pays.rayon} km\n\n💵 **Tarification :**\n• **Prix au kilomètre :** ${pays.prix_km} ${pays.devise}/km\n• **Prix minimum d'une course :** ${pays.minimum} ${pays.devise}\n• **Devise :** ${pays.devise}\n\n📊 **Comment le prix est calculé :**\nLe prix est calculé automatiquement selon la distance entre le point de départ et le point d'arrivée. Vous voyez le prix avant de valider la commande.\n\n💳 **Paiement :**\n• Mobile Money (Orange Money, etc.)\n• Espèces directement au livreur\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\n**D'autres questions sur les tarifs ?**`;

    case "support":
      return `📞 **Contacter le support SILGAPP**\n\nNotre équipe est disponible pour vous aider :\n\n📱 **WhatsApp / Téléphone :** **${SUPPORT_PHONE}**\n\n⏰ **Horaires :** 7j/7 de 8h à 22h\n\n💬 **Vous pouvez aussi me poser vos questions ici** — je suis VENUS, votre assistante virtuelle, et je peux vous guider sur l'utilisation de SILGAPP.\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\n**Comment puis-je vous aider ?**`;

    case "promo":
      return `🎁 **Codes promo et parrainage SILGAPP**\n\n**Comment ça marche :**\n• Chaque client SILGAPP a un **code promo unique**\n• Partagez votre code à vos amis\n• Quand un ami s'inscrit avec votre code, il reçoit **100 ${getPaysInfo(countryContext).devise} de réduction** sur sa première course\n• Vous recevez aussi **100 ${getPaysInfo(countryContext).devise}** quand il valide sa première course\n\n**Comment trouver mon code :**\n• Allez dans l'onglet **"Mon code promo"** dans l'application\n• Partagez-le par WhatsApp, SMS ou réseaux sociaux\n\n**Plus vous parrainez, plus vous gagnez !** 🎉\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "qr_pin":
      return `📱 **QR codes et codes PIN SILGAPP**\n\n**Récupération du colis :**\n• Le livreur scanne votre **QR code de récupération**\n• Si le QR ne fonctionne pas, donnez-lui le **code PIN à 4 chiffres**\n\n**Livraison du colis :**\n• Le destinataire scanne le **QR code de livraison**\n• Ou donne le **code PIN de livraison** au livreur\n\n**Où trouver mes codes ?**\n• Dans le détail de votre course active\n• Le lien de suivi public est partageable\n\n✅ **Les codes garantissent que le colis est remis à la bonne personne**\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "become_driver":
      return `🚴 **Devenir livreur SILGAPP**\n\n**Conditions :**\n• Avoir au moins 18 ans\n• Posséder un moyen de transport (moto, vélo, voiture, ou à pied)\n• Avoir un téléphone avec l'application SILGAPP\n• Résider à **${pays.ville}** ou dans les environs\n\n**Comment s'inscrire :**\n1. Téléchargez l'application SILGAPP\n2. Choisissez "Devenir livreur"\n3. Remplissez le formulaire d'inscription\n4. Soumettez vos documents (CNI, photo, véhicule)\n5. L'équipe SILGAPP valide votre compte\n\n💰 **Rémunération :**\n• Vous êtes rémunéré sur chaque course que vous effectuez\n• Paiement direct par le client\n• Pour le détail de vos gains, contactez le support SILGAPP\n\n📞 **Support livreur :** ${SUPPORT_PHONE}\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "tracking":
      return `📍 **Suivre votre livraison SILGAPP**\n\n**Pendant la course :**\n• La position GPS du livreur s'affiche en **temps réel** sur la carte\n• Vous voyez le temps estimé d'arrivée\n• Vous recevez des notifications à chaque étape\n\n**Étapes de suivi :**\n1. 🛵 Livreur en route vers vous\n2. ✅ Arrivé au point de prise en charge\n3. 📦 Colis récupéré\n4. 🚀 En livraison\n5. 📍 Arrivé à destination\n6. ✅ Livré !\n\n**Lien de suivi public :**\n• Partagez le lien de suivi avec le destinataire\n• Il peut suivre la livraison sans installer l'application\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "multi_colis":
      return `📦 **Multi-colis SILGAPP**\n\nVous pouvez envoyer **plusieurs colis** dans une seule course :\n\n**Comment faire :**\n1. Lors de la création de la course, sélectionnez **"Multi-colis"**\n2. Ajoutez chaque colis avec son destinataire\n3. Le livreur gère chaque colis individuellement\n4. Chaque destinataire reçoit son propre QR code / code PIN\n\n**Avantages :**\n• Économisez sur les frais de livraison\n• Un seul livreur pour plusieurs destinataires\n• Suivi individuel de chaque colis\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "cancellation":
      return `⚠️ **Annulation d'une course SILGAPP**\n\n**Avant l'acceptation par un livreur :**\n• L'annulation est **gratuite**\n• Aucun frais n'est appliqué\n\n**Après l'acceptation par un livreur :**\n• Des **frais d'annulation** peuvent s'appliquer\n• Le montant dépend du pays et de l'avancement de la course\n\n**Comment annuler :**\n• Allez dans le détail de votre course active\n• Appuyez sur **"Annuler la course"**\n• Confirmez l'annulation\n\n📞 **Problème d'annulation ?** Contactez le support : ${SUPPORT_PHONE}\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "countries":
      return `🌍 **SILGAPP — ${pays.nom}** ${pays.emoji}\n\nSILGAPP est disponible dans votre pays : **${pays.nom}** 📍\n\n**Votre session est configurée sur :** ${pays.nom}\n**Ville principale :** ${pays.ville}\n**Indicatif :** ${pays.indicatif}\n\n⚠️ Pour des informations sur un autre pays, veuillez changer de pays dans l'interface SILGAPP.\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    case "account":
      return `👤 **Votre compte SILGAPP**\n\n**Vos informations :**\n• Nom, prénom, téléphone\n• Pays et ville\n• Email de connexion\n\n**Sécurité :**\n• Une seule session active par compte\n• Vos données sont protégées et confidentielles\n\n**Modifier vos informations :**\n• Allez dans votre profil dans l'application\n• Vous pouvez mettre à jour votre photo et vos coordonnées\n\n📞 **Problème de compte ?** Contactez le support : ${SUPPORT_PHONE}\n\n❤️ *Plus qu'un service, une promesse* ❤️`;

    default:
      return `Bonjour 👋 Je suis **VENUS**, votre assistante **SILGAPP** pour **${pays.nom}** ${pays.emoji}\n\nJe peux vous aider avec :\n\n📦 **Créer une course** — Expédier, recevoir ou se déplacer\n💰 **Tarifs** — ${pays.prix_km} ${pays.devise}/km, minimum ${pays.minimum} ${pays.devise}\n📍 **Suivi** — Suivre votre livraison en temps réel\n📱 **QR codes & PIN** — Sécurité de récupération\n🎁 **Code promo** — Parrainez vos amis\n🚴 **Devenir livreur** — Rejoignez SILGAPP\n📞 **Support** — ${SUPPORT_PHONE}\n\n**Posez-moi votre question !**\n\n❤️ *Plus qu'un service, une promesse* ❤️`;
  }
}

// Vérifier si une erreur est liée aux crédits/quota
export function isCreditError(err) {
  const msg = (err?.message || "") + " " + (err?.response?.data?.error || "") + " " + (typeof err === "string" ? err : "");
  return /credit|quota|exhaust|limit|402|429|insufficient|billing|plan|tier|forbidden|unauthorized|unavailable|timeout|network|fetch|500|502|503/i.test(msg);
}