# Architecture multi-pays — SILGAPP

> IMPORTANT — Architecture multi-pays : SILGAPP doit conserver une seule base de code et une seule logique métier commune à tous les pays. Toute correction de bug, amélioration ou nouvelle fonctionnalité apportée au système commun doit automatiquement s'appliquer à tous les pays actuels et futurs. Il ne faut pas dupliquer le code ou créer une version de SILGAPP par pays. Seules les données et configurations spécifiques (tarifs, devise, commissions, villes, rayon, indicatif téléphonique, etc.) doivent varier selon le pays. Une exception par pays ne doit être créée que lorsqu'elle est explicitement demandée par le product owner.

## Principes directeurs

1. **Une seule base de code** — Pas de duplication de logique métier par pays.
2. **Configuration dynamique** — Tous les paramètres spécifiques (tarifs, devise, commissions, indicatifs, villes, rayon de dispatch) sont stockés en base de données (entité `Country`) et lus dynamiquement.
3. **Isolation des données** — Chaque enregistrement porte son `country_code` ; les requêtes filtrent par pays. Aucune donnée d'un pays n'est visible depuis un autre.
4. **Bénéfice automatique** — Une correction de bug sur le moteur commun profite instantanément à tous les pays (BF, CI, TG, GH, NG, MA, etc.).
5. **Expansion sans code** — Ajouter un nouveau pays se fait via l'interface Admin → Gestion des pays, sans modification du code source.
6. **Exceptions explicites** — Si une fonctionnalité doit être désactivée ou adaptée pour un pays spécifique, cela doit être explicitement demandé et justifié.

## Ce qui varie par pays (configuré en BDD)

- Devise (FCFA, GHS, NGN, MAD, etc.)
- Tarifs (prix/km, prix minimum)
- Commissions (boutique, restaurant, pharmacie)
- Indicatif téléphonique et format des numéros
- Villes et quartiers couverts
- Rayon de dispatch
- Moyens de paiement disponibles (optionnel)
- Fonctionnalités activées (optionnel, via flags)

## Ce qui ne varie jamais par pays

- Logique de dispatch (Dispatch V2)
- Logique de tarification (calcul dynamique basé sur Country)
- Logique de commission (calcul dynamique basé sur CommissionConfig)
- Workflows VENUS
- Gestion des courses et statuts
- Gestion des livreurs et clients
- Notifications push
- Messagerie WhatsApp
- Interface et composants UI