# Current GPS and native social preparation

The repository contains source preparation for shared GPS eligibility and native
session handling. Native Google/Apple remains disabled. Existing email/password,
branding, accepted missions and financial rules are preserved. iOS release settings
are provisional until current App Store Connect numbering and submission state
are verified. Source preparation does not deploy backend schemas or activate cities.

## Decision GPS

- Pour une nouvelle course dont la ville de depart est active, seule la position
  GPS acquise depuis au plus 120 secondes, de precision connue entre 0 et 100 m,
  associee a un quartier connu dans un rayon de 30 km determine la ville du livreur.
  Les coordonnees doivent etre valides, le pays est requis et la date ne peut pas
  etre future. La ville de profil et l'heure du heartbeat ne sont pas des preuves.
- Ces seuils reprennent les controles stricts existants de changement de ville.
  L'ancien repli sur un GPS de dix minutes n'autorise plus une nouvelle course
  protegee. L'hysteresis de 5 km reste uniquement pour mettre a jour le profil.
  Le helper de GPS de livraison a une tolerance future de 5 secondes ; le controle
  de ville reste a zero seconde. Cette difference n'a pas ete changee implicitement.
- `OperationalCity.actif` est l'unique source d'activation. Saaba est rattachee
  canoniquement a Ouagadougou. Aucun nom de quartier n'invente une ville.
- Une origine inactive garde l'eligibilite geographique historique, meme si une
  autre ville est active. Le cas Bobo ON / Ouaga OFF est couvert dans les deux sens.
  Toutes les villes OFF ne provoquent aucun nouveau filtre GPS. Les controles
  pays, Public/Enterprise, disponibilite et blocage restent independants.
- Les missions deja acceptees restent accessibles. Une acceptation Eco partielle
  reste recuperable sans exiger une nouvelle preuve GPS. Une assignation admin
  deja effectuee reste idempotente. Aucun changement de tarification, commission,
  verrou de course, route terminee ou suivi de mission n'est ajoute.

`currentGpsCity.js` porte la politique commune. Le heartbeat enregistre la date
d'acquisition, la validite et la ville GPS indexee, distinctes de la date de
reception. Un paquet GPS invalide invalide cette preuve ; un heartbeat sans GPS
ne la renouvelle pas. Le service Android transmet desormais `Location.getTime()`
et une precision absente reste absente, plutot qu'un zero fabrique. Le pont JS
conserve de meme `timestamp`/`time`, sans fabriquer `Date.now()`.

Le fil, le compteur et la proposition de nouvelle course reutilisent la meme
eligibilite GPS. Une proposition asynchrone ancienne est ignoree apres changement
du GPS. Les notifications unifiees et batch relisent les candidats en un lot et
recalculent la ville ; le push individuel applique aussi les gardes pays/tenant/GPS.
L'acceptation Standard et celle d'une nouvelle mission Eco relisent la position
juste avant le claim. Les CAS existants sur les courses sont conserves. La lecture
du GPS et le claim ne constituent pas une transaction multi-entites : un mouvement
concurrent reste une limite a valider avec le backend reel.

## Schema, compatibilite et cout

Trois champs facultatifs sont prepares dans `Livreur.jsonc` : `gps_fix_date`,
`gps_fix_valid` et `gps_operational_city`. Aucune migration ni synchronisation
de schema n'a ete executee. Une integration future doit etre additive et ciblee,
avec sauvegarde et relecture des schemas, y compris User. Une synchronisation
complete qui omet des schemas peut les supprimer et ne doit pas etre utilisee
pour appliquer ces trois champs sans verification.

Les anciennes applications sans date d'acquisition ne peuvent pas obtenir une
nouvelle course protegee. Il faut donc livrer les nouveaux clients mobiles avant
une activation de ville. Les origines OFF et les missions existantes restent
accessibles selon les regles precedentes. Les filtres Base44 sur ces nouveaux
champs, leurs valeurs nulles et les droits de lecture/ecriture demandent encore
un essai controle sur la plateforme. Le GPS provient du client ; ceci n'est pas
une attestation materielle contre la falsification. Les RLS de profil existantes
n'ont pas ete modifiees et leur resistance a un client hostile n'est pas prouvee.

Le fil lit le propre Livreur toutes les 10 secondes quand une ville est active,
soit environ six lectures par minute et par cle de cache observee, avec invalidation
sur ses evenements temps reel. React Query partage les memes cles entre composants.
Les abonnements/evenements peuvent ajouter des rafraichissements. Il n'y a pas
de lecture de quartiers pour cette politique lorsque toutes les villes sont OFF.
Le backend utilise les caches existants : villes 30 secondes, quartiers 10 minutes
par instance chaude. Une selection de notification ajoute une lecture groupee,
pas une lecture par candidat. Le claim ajoute une lecture Livreur pour Standard,
deux pour les deux colis Eco. Le polling historique du profil reste en place.
Le compteur et la proposition reutilisent le fil ; leur ancienne requete large
de courses est retiree. La proposition ne lit DispatchNotification que si le fil
contient une course proposee. Aucun appel cartographique payant n'est ajoute.
Le cout facture et la latence sur la plateforme n'ont pas ete mesures.

## Preparation Google et Apple

`socialAuth.js` et `SocialLoginButtons.jsx` deleguent au SDK installe 0.8.53
`base44.auth.loginWithProvider(provider, fromUrl)`. Le retour web est de meme
origine, sans recopier de query ou fragment. La disponibilite configuree d'un fournisseur ne prouve pas une session native. Les deux indicateurs
`webSessionVerified` restent false et les boutons sociaux restent masques.
L'ecran e-mail/mot de passe et les trois selections de branding iOS sont preserves.

Aucun bridge de session natif, transfert de bearer dans un nouveau lien, echange
d'identityToken, fusion de comptes ou changement de role n'est ajoute. Le SDK
permet d'installer une session Base44 deja emise ; le retour securise entre le
navigateur et cette application Capacitor reste a implementer et valider.
Les simulations de recherche hors depot ne font pas partie de ce candidat.

Avant ouverture : parcours Google ET Apple avec `auth.me`, bonne identite,
role/pays/tenant, erreurs/annulation, retours chaud/froid et maintien de session
apres redemarrage sur appareils. Les champs GPS optionnels restent a appliquer
par une operation additive ciblee avec preservation des schemas existants.

References :
- https://docs.base44.com/developers/references/sdk/docs/interfaces/auth#loginwithprovider
- https://docs.base44.com/Setting-up-your-app/Managing-login-and-registration

## Validation du candidat

- 27 suites de regression integrees passent : GPS, zones, notifications/claims
  avec adaptateurs isoles, Standard/Eco, recuperation, commissions, idempotence,
  fil, Victory, preparation sociale, branding et outils de livraison iOS.
- Lint et typecheck projet : exit 0. `checkJs` est false ; ce controle ne couvre
  pas l'ensemble du backend Deno ou du Java.
- Build web : exit 0, Vite 3m4s. Quatre avertissements CSS et les chunks volumineux
  restent non bloquants. Aucun deploiement web n'est realise par ce build.
- Android `:app:assembleDebug --offline` : exit 0, 224 taches en 7m4s. Metadonnees
  du package officiel et version 1.0.132/139 verifiees. Outils/dependances et cle
  debug existants utilises ; aucun appareil installe, APK release/AAB ou publication.
  Les chemins temporaires Capacitor locaux sont retablis en chemins portables.
- Deno 2.9.7 strict, snapshots et cache identiques : 80 diagnostics dans la base
  et le correctif sur le graphe transition, 140/140 sur les entrees GPS modifiees.
  Aucune signature ajoutee ou retiree. Les commandes restent exit 1 pour les
  erreurs anterieures ; ce n'est pas un PASS. `checkJs` reste false.
- GPS physique, FCM, zones actives, RLS hostile et OAuth reel restent non valides.
  Correction 20 reste differee. Aucun envoi de notification/course/paiement reel.

Les wrappers examines chargent `webDir: dist` sans `server.url`. Leurs assets
sont embarques : changer le fil exige une nouvelle version mobile. Le backend
et les schemas demandent leur propre validation/deploiement avant activation.
