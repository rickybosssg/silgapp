# Préparation iOS depuis Android 170 — 29 octobre 2026

## Source et périmètre

Référence validée par Eric : Android 1.0.163 / code 170. Identité vérifiée directement dans l'APK ; SHA256 APK aaabb15d74c7a39c708501051d14f96569a31d4e119d8130fb1bfc377b672a11 ; SHA256 AAB f070e6a7fbec5a84fed9434320e6dc8d92c3bd8dfcbdeeb49e2d9f6bcd0c338b. Les 1281 fichiers du manifeste de construction correspondent à la source figée. Le dernier code validé inclut safeDeliveryFinalization : aucun effacement systématique de token sur 401, confirmation serveur et relecture des réponses incertaines sans répétition automatique d'écriture.

Base iOS : 5d23318ebaa9cfcee47b8b8090d5c0646c8ed35e. Copie isolée ; les dossiers Android, ios155 et leurs modifications ont été préservés. Le HEAD Android db43e678 seul ne décrit pas l'artefact : des fichiers validés restent non commités et sont identifiés par manifeste.

## Corrections réunies

Accueil Invité et bouton rouge Commander sans compte quand le contrôle serveur l'autorise ; pas d'OTP dans ce parcours ; inscription facultative, reprises et nouvelles commandes successives. BF proposé initialement, choix explicite et pays de service séparé de l'indicatif ; catalogue invité BF/BJ/CI/GH/TG. Administration publique Commandes sans compte à /admin/commandes-sans-compte ; filtre pays/date/statut, montants, contacts déclarés non vérifiés, compteurs, détails et révocation d'accès privé. Activation réservée au Super Admin, selon contrôles serveur existants. Envoi d'invitations indisponible.

Progression livreur confirmée, prix montant/devise, réponse ancienne ignorée, mutex finalisation et récapitulatif ; aucun faux succès sur 401/refus. Victory conserve neuf secondes, contrôle de fermeture, ajustement du mot et son iOS existant. Le double rappel trouvé pendant la fusion a été retiré. Commander classique, Express écrit/éclair, annulation terminale, missions acceptées, pays/entreprises, GPS acquisition, sessions et callbacks iOS conservés. Aucun audio Express ni QR/PIN de course réactivé. Les connexions natives Google/Apple restent désactivées tant que leurs prérequis ne sont pas établis.

Les sources backend sont rapprochées conservativement, avec maintien des protections iOS de participation avant réponse idempotente de messagerie et d'identité push du même compte. AUCUN déploiement, schéma, permission, activation de ville ou donnée métier n'est modifié. Le contenu local des fonctions ne prouve pas la version effectivement déployée ; les snapshots historiques des tests sont explicitement des fixtures.

## Vérifications

277 tests ciblés passent (régression 170, progression, invité, erreurs, limitation des lectures, annulation, Express). 199 régressions historiques iOS, 17 contrôles Python de signature/version et 12 contrôles d’icône/workflow passent également. Les reçus sont séparés dans le dossier de preuves. Les simulations exécutent des composants/helpers réels avec adaptateurs synthétiques ; elles ne sont pas des tests de production ou sur iPhone.

Lint de src sans erreur ; TypeScript du projet iOS sans erreur (configuration checkJs=false conservée, pas une validation globale du JavaScript Android). Construction web de production réussie avec les paramètres publics de l'application existante. Le lock des dépendances, le projet natif iOS, ses permissions, entitlements, callbacks, icônes, manifeste PrivacyInfo, scripts de signature et workflows restent inchangés. Profil historique valide jusqu'au 14 octobre 2027 ; disponibilité réelle des secrets/signature à confirmer par la prochaine exécution CI.

## Dossier Apple préparé, non envoyé

Lecture API Apple du 29 octobre : 1.0.64 en vente, dernier build 73 VALID ; aucun 74 ni version 1.0.65 constaté. Proposition suivante : 1.0.65 / build 74 ; relire avant signature et upload. Bundle et équipe existants conservés. Aucun enregistrement Apple créé/modifié ; aucun mode de publication changé.

Nouveautés proposées : « Commandez sans compte lorsque le service est disponible, reprenez votre suivi et créez de nouvelles demandes. Améliorations de la progression livreur, de l'affichage du prix et de la gestion des réponses de livraison. » Ces nouveautés restent à vérifier sur le binaire iOS final avant transmission.

Notes de revue proposées : « L'application permet les demandes de livraison invitées sans OTP, selon disponibilité du service, avec choix explicite du pays et confirmation du récapitulatif. Le suivi est conservé sur l'appareil. L'inscription reste facultative pour le parcours invité. Les espaces livreur et administration nécessitent les accès existants fournis séparément dans App Store Connect. Les numéros invités sont déclarés, non vérifiés. » Ne pas inventer de compte de démonstration ni exposer les accès de revue dans Git.

Captures Apple existantes : jeux iPhone/iPad livrés COMPLETE ; aucune nouvelle capture native du candidat. Les captures Android/web ne doivent pas être présentées comme captures natives iOS. Vérifier l'accès de revue existant et ses instructions avant soumission. La déclaration de chiffrement du nouveau build n'est pas transmise ou héritée automatiquement du 73.

## Réserves et prochaines étapes

Le document public de confidentialité déclaré dans Apple renvoie encore HTTP 200 avec zéro octet lors du téléchargement officiel du 29 octobre. La politique embarquée historique et les déclarations de collecte nécessitent une revue factuelle ; elles n'ont pas été modifiées. La suppression de compte effective reste à établir, sans considérer une désactivation comme suppression. Les règles locales CourseExterne comportent encore des conditions read/create/update vides : leur protection directe en production n'est pas démontrée par les tests fonctionnels ou les mocks invités. Aucun accès réel n'est élargi ou testé sur une course de client.

Autorisation spécifique à obtenir avant publication des nouvelles corrections dans le dépôt GitHub public et déclenchement CI. La chaîne archive signée existante exporte seulement un IPA ; ses tags ios-signed-v* ne déclenchent pas l'ancien workflow d'upload. Après accord : relecture des branches et numéros Apple, pin source, métadonnées version/build uniques, compilation signée, vérification du binaire et captures natives autorisées. Aucun nouvel achat, secret ou certificat.

La soumission finale, le build exact à envoyer et le dossier doivent être confirmés séparément. Ne pas déclencher la soumission ni changer la publication automatique sur la base de cette préparation. Aucun IPA nouveau n'est encore produit, aucun upload ou soumission n'est effectué.
