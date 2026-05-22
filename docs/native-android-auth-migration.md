# Migration vers login natif Android

## Objectif

Remplacer le flux actuel Base44 web/OAuth par une experience mobile native :

- Firebase Authentication natif Android
- Google Sign-In natif Android
- session persistante locale
- ouverture directe du dashboard apres connexion
- aucune page navigateur Base44 visible
- notifications push conservees

## Diagnostic

L'application utilise aujourd'hui `@base44/sdk` pour toutes les donnees :

- `base44.auth.me()`
- `base44.entities.*`
- `base44.functions.*`
- subscriptions temps reel

Ces appels exigent un token Base44. Un token Firebase (`idToken`) ne remplace pas automatiquement un token Base44.

Donc la migration native doit aussi definir comment convertir, synchroniser ou remplacer la session Base44.

## Etat Firebase actuel

Le fichier `android/app/google-services.json` est present et correspond au package :

```text
com.silgapp.app
```

Mais il ne contient pas encore de client OAuth Android :

```json
"oauth_client": []
```

Pour Google Sign-In natif, Firebase doit etre configure avec les empreintes SHA de l'application Android, puis un nouveau `google-services.json` doit etre telecharge.

## Pre-requis Firebase Console

Dans Firebase Console :

1. Ouvrir le projet `silgapp`.
2. Aller dans Authentication > Sign-in method.
3. Activer Google.
4. Aller dans Project settings > Android app `com.silgapp.app`.
5. Ajouter les empreintes SHA-1 et SHA-256 du certificat utilise pour l'APK.
6. Telecharger le nouveau `google-services.json`.
7. Remplacer `android/app/google-services.json`.

Pour une APK debug, utiliser l'empreinte du debug keystore. Pour une vraie distribution, utiliser l'empreinte de la cle release.

Empreintes debug actuelles de cette machine :

```text
SHA-1   4F:AE:52:73:E4:D7:6A:DA:32:3A:22:AF:9C:6F:CD:A3:87:5E:7D:E5
SHA-256 C3:D3:5B:D1:2E:36:06:A8:83:FD:77:C0:B3:85:03:50:1F:B8:45:88:66:80:E0:2A:B0:C3:68:55:DE:D9:73:62
```

## Architecture recommandee

### Phase 1 - Login natif Firebase dans l'APK

Installer un plugin Capacitor Firebase Auth :

```bash
npm install firebase @capacitor-firebase/authentication
npx cap sync android
```

Ajouter un service `src/lib/nativeAuth.js` :

- `signInWithGoogleNative()`
- `signInWithEmailPasswordNative(email, password)`
- `getCurrentFirebaseUser()`
- `signOutNative()`
- persistance locale Firebase

Creer une page login mobile native avec :

- bouton "Continuer avec Google"
- formulaire email/password
- etat chargement
- erreurs Firebase lisibles

### Phase 2 - Liaison Firebase vers Base44

Choisir une strategie :

#### Option A - Garder Base44 comme backend principal

Il faut un endpoint serveur capable de verifier le Firebase ID token puis d'obtenir une session Base44 utilisable.

Condition bloquante : Base44 doit fournir une API officielle pour creer/echanger un token utilisateur Base44 depuis un backend. Sans cette API, Firebase Auth ne peut pas authentifier les appels `base44.entities.*`.

#### Option B - Utiliser Firebase Auth pour l'identite et Base44 en service role

Creer des fonctions backend qui :

- verifient le Firebase ID token avec Firebase Admin
- lisent/ecrivent les entites Base44 via service role
- appliquent elles-memes les permissions admin/livreur

Impact : remplacer progressivement les appels directs `base44.entities.*` cote client par des fonctions backend securisees.

#### Option C - Migrer backend hors Base44

Utiliser Firebase Auth + Firestore/Cloud Functions.

Impact : migration plus lourde, mais experience native et controle total.

## Pourquoi ne pas simplement remplacer par Firebase maintenant ?

Le dashboard actuel depend fortement de Base44 Auth. Si on connecte seulement Firebase :

- l'utilisateur Firebase sera connecte
- mais `base44.auth.me()` echouera
- les entites Base44 seront non autorisees
- les fonctions push protegees par Base44 seront non autorisees
- les roles admin/livreur ne seront pas resolus

La migration native doit donc inclure un pont d'authentification, pas seulement une nouvelle UI.

## Notifications push

Les notifications push Android restent compatibles avec cette migration :

- `google-services.json` est deja utilise par Gradle
- `processDebugGoogleServices` passe au build
- `@capacitor/push-notifications` est inclus
- l'APK contient `POST_NOTIFICATIONS`
- l'APK contient `com.google.android.c2dm.permission.RECEIVE`
- l'APK contient `FirebaseInitProvider`

Apres migration Firebase Auth, l'enregistrement du token push devra utiliser l'identite Firebase ou le pont Base44 choisi.

## Etapes de implementation proposees

1. Mettre a jour Firebase Console avec SHA-1/SHA-256.
2. Remplacer `android/app/google-services.json`.
3. Installer `firebase` et `@capacitor-firebase/authentication`.
4. Ajouter `src/lib/nativeAuth.js`.
5. Ajouter une page `NativeLogin.jsx`.
6. Adapter `AuthContext` pour gerer deux etats :
   - session Firebase native
   - session applicative Base44 ou backend bridge
7. Choisir et implementer la strategie de pont Base44.
8. Rebrancher push token apres session valide.
9. Generer APK debug puis APK release signee.

## Decision necessaire

Avant d'enlever definitivement le navigateur Base44, il faut choisir la strategie de pont :

- si Base44 fournit un endpoint d'echange Firebase vers Base44 token, utiliser Option A
- sinon, utiliser Option B et securiser toutes les actions via fonctions backend
