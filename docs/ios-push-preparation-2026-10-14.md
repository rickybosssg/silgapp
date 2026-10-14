# Préparation locale du correctif push iPhone — 14 octobre 2026

Base : `codex/release-gps-social-20261014`, commit
`3f65a1786583017eff63bf0bd8dcbbcbe623199e`. Diff local non publié et non déployé.

## Corrections

1. `ios/App/App/AppDelegate.swift` : associer le jeton APNs à Firebase Messaging,
   obtenir le jeton FCM et transmettre sa chaîne à Capacitor, y compris lors d'un
   renouvellement. Les événements sont transmis sur le fil principal. Aucun jeton
   n'est journalisé. Firebase/Messaging est déjà déclaré dans le Podfile.
2. `src/lib/notifications.js` : utiliser les permissions natives sur iOS, réserver
   les API SilgappPush/canaux Android à Android et conserver la présentation native
   iOS existante. Ordonner les écritures de jetons du même processus et vérifier la
   session active avant persistance ou fallback. Un ancien contexte retardé ne
   remplace plus celui du compte courant. Retirer les préfixes de jetons des logs.
3. `src/hooks/useClientNotifications.js` et `src/pages/ClientExterneApp.jsx` : passer
   l'identifiant du profil client lors de cette inscription supplémentaire.
4. `base44/functions/enregistrerTokenPush/entry.ts` : conserver le client_id existant
   si absent/null/vide pour le même compte. Lors d'un changement de compte, ne pas
   reprendre l'identifiant précédent. Préserver les règles multi-appareils et de
   rôle. Normaliser l'erreur attrapée pour le contrôle TypeScript strict.
5. `src/lib/livreurUrgentAlert.js` : limiter les trois appels natifs d'alerte/arrêt
   au plugin Android, avec les mêmes paramètres Android. Le nettoyage JS partagé
   demeure actif sur iOS.

Le défaut du pont est établi dans les sources : Capacitor transmet APNs sur iOS,
alors que le serveur utilise FCM v1. Cela ne prouve pas, seul, la cause exacte du
message non reçu par Annick. L'inscription iOS existait déjà côté JavaScript.

Références :
[Capacitor 5 Token](https://capacitorjs.com/docs/v5/apis/push-notifications#token),
[Firebase Messaging iOS](https://firebase.google.com/docs/cloud-messaging/ios/get-started).

## Validation et limites

- `node --test tests/ios-push-registration-regression.mjs` : 23 cas réussis. Les
  quatre défauts initiaux ont été reproduits avant correction. Les cas exécutent
  les fonctions JS et le handler serveur avec faux plugins, fausse session et
  données fictives ; la partie Swift reste un contrat de source, pas une compilation.
- 27 suites historiques réussies, y compris GPS/villes, récupération Eco, routes,
  finance/commissions, Victory, préparation OAuth et règles de livraison iOS.
- Lint et TypeScript du projet réussis. Ces contrôles ne couvrent pas à eux seuls
  tous les fichiers JS/backend ; les adaptateurs ciblés complètent leur périmètre.
- Les journaux et résultats des contrôles web/Deno se trouvent dans le dossier
  adjacent `release-validation`, fichiers préfixés `ios-push-`.
- Deno strict, handler modifié : PASS, zéro diagnostic ; le seul diagnostic de la
  version de référence est supprimé par la normalisation de l'erreur attrapée.
- Compilation web configurée SILGAPP réussie avec le chargeur Vite natif. Le premier
  lancement sandbox avait échoué au chargement de configuration sur un refus de
  lecture ; aucun paquet n'a été remplacé. L'identifiant/URL publics sont fournis
  uniquement à l'environnement du processus, sans réglage persistant.
- Aucun test de réception physique, aucun envoi réel, aucun accès à un jeton client,
  aucun changement APNs/Firebase, clé ou profil. Aucun déploiement serveur.
- La sérialisation couvre un runtime JavaScript. Elle ne garantit pas l'annulation
  d'une requête déjà acceptée par le serveur, ni un upsert atomique entre processus
  ou versions anciennes. Les tests d'idempotence du handler sont séquentiels.
- Aucun nouveau mécanisme de désinscription serveur au logout n'est ajouté ; les
  vérifications empêchent de nouvelles écritures avec une session absente/périmée.

## Étapes encore nécessaires

La compilation Swift nécessite macOS/Xcode. Le run iOS réussi
[38561892804](https://github.com/rickybosssg/silgapp/actions/runs/38561892804)
couvre uniquement `3f65a178`, avant ce diff. Une nouvelle exécution unsigned doit
porter exactement le diff revu, avec son autorisation de publication/CI.

L'APK signé Android 1.0.132/139 déjà vérifié est également antérieur au correctif.
Son SHA-256 est
`2082cf83a7d6ffcafd059339e81431086bf31b7d0c359f389b4eaa8f32352bed` ; il reste
non installé. Le flux Google natif reste fermé et non validé.

Après compilation, la correction ne pourra atteindre les iPhone installés qu'avec
une livraison mobile et le déploiement serveur séparément autorisés, puis un test
ciblé sur appareil. Confirmer le build TestFlight, les permissions/Focus, l'état de
l'app et les résultats non secrets du serveur/FCM. La configuration APNs existante
dans Firebase reste à vérifier sans lire de clé privée. L'acceptation FCM ne prouve
pas l'affichage sur un téléphone.
