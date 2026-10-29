# iOS depuis Android 171 — 29 octobre 2026

Référence vérifiée : Android 1.0.164 / build 171. Les 1281 sources du manifeste correspondent au checkout lors du gel. APK SHA256 275b5d4cd0fb3bf5bd714d0865bb50577572f6eab9c12d9a38064325ad7e2235 ; AAB SHA256 287fa26fee10186772050bbb63b29370858c0544376fa3484b6748da31def676. La validation physique de la livraison et de la session est rapportée par Eric ; aucun test métier réel n'est rejoué ici.

Delta exact : confirmedPickupView, confirmedDelivery, courseFunctionResult, LivreurExterneApp et EcoMissionDashboard. Révisions serveur récentes prioritaires, annulation conservée, cache livré confirmé avant actualisation, mutex immédiat Éco, lecture directe/enveloppée et refus explicite des réponses malformées. Conservation des protections iOS de GPS horodaté et de récupération avant livraison, de sessions, suivi, Victory, commandes Invité et Express écrites sans QR/PIN. Aucun serveur, permission, schéma, politique ou paramètre métier modifié.

Les adaptateurs VM historiques ont reçu les nouvelles dépendances réelles de cache/mutex ; les assertions restent présentes. Les extractions d'import acceptent CRLF sous Windows. Les premières erreurs sont conservées dans les preuves ; les simulations ne sont pas des tests iPhone ou de production. L'adaptateur du handler Éco vérifie aussi que les coordonnées et leur horodatage sont transmis à la finalisation.

Limites connues : compteur Aujourd'hui à zéro après livraison, sonnerie sans carte Disponible et erreurs historiques non déclarés résolus. Confidentialité directe et suppression effective non certifiées par ce lot. Aucun test iPhone de ce candidat ; captures Apple existantes préservées, aucune capture Android présentée comme iOS.

Apple : 1.0.65/build74 WAITING_FOR_REVIEW, AFTER_APPROVAL, relecture du 29 octobre. Candidat distinct proposé 1.0.66/build75, sans retirer ni modifier cette revue. Si le propriétaire veut remplacer le74 avant approbation, une décision spécifique et une cible de version compatible sont nécessaires ; cet IPA distinct ne doit pas être présenté comme remplaçant directement le74 dans la même version. Aucune nouvelle soumission ou fiche créée par cette préparation.

Nouveautés : améliorations des réponses récentes de courses, de la persistance visuelle des livraisons confirmées et de la protection contre les doubles clics Éco. Ne pas annoncer une résolution du compteur Aujourd'hui ni des sonneries sans carte.
