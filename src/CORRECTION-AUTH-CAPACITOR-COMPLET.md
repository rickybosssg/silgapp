# Correction Auth APK Android Studio — Guide Complet

## Fichiers modifiés automatiquement

### 1. `lib/app-params.js` (ligne 86-88)
- **Avant** : `safeHref = window.location.href` (= `file:///android_asset/...`)
- **Après** : `safeHref = APP_PUBLIC_URL` (= `https://silga-dispatch-go.base44.app`)
- **Effet** : le `redirect_uri` envoyé à Base44 est maintenant une URL HTTPS valide

### 2. `api/base44Client.js` (début du fichier)
- Ajout d'un listener `App.addListener('appUrlOpen')` pour intercepter le deep link de retour
- Quand Base44 redirige vers `https://silga-dispatch-go.base44.app/?access_token=XXX`, l'event est capturé, le token stocké, puis `window.location.href = '/'` recharge l'app avec le token

### 3. `components/auth/AuthGate.jsx`
- Ajout de `openLogin()` : sur Capacitor, utilise `@capacitor/browser` pour ouvrir le login dans le **navigateur système** (Chrome), pas dans la WebView principale
- Cela garantit que le retour OAuth se fait via un deep link, pas via la navigation interne de la WebView

### 4. `capacitor.config.json`
- Ajout de `server.allowNavigation` pour `silga-dispatch-go.base44.app` et `app.base44.com`
- Permet à la WebView de naviguer vers ces domaines sans bloquer le flux OAuth

---

## Modification manuelle requise dans Android Studio

### Ouvrir `android/app/src/main/AndroidManifest.xml`

Ajouter ce bloc DANS `<activity android:name=".MainActivity">` juste après le premier `<intent-filter>` existant :

```xml
<!-- Deep link : intercepte le retour OAuth de Base44 -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="silga-dispatch-go.base44.app" />
</intent-filter>
```

### Pourquoi ce filtre est nécessaire
Sans ce filtre, quand Chrome (ouvert par `@capacitor/browser`) reçoit la redirection vers
`https://silga-dispatch-go.base44.app/?access_token=XXX`, Android ne sait pas qu'il faut
rouvrir l'APK SILGAPP. Le filtre d'intent dit à Android : "si une URL sur ce domaine est ouverte,
rouvre SILGAPP et passe-lui l'URL via `appUrlOpen`".

---

## Commandes à exécuter (dans l'ordre)

```bash
# 1. Rebuild le bundle web avec les corrections
npm run build

# 2. Synchroniser vers le projet Android
npx cap sync android

# 3. Dans Android Studio :
#    - Ouvrir android/app/src/main/AndroidManifest.xml
#    - Ajouter le bloc intent-filter ci-dessus
#    - Build → Clean Project
#    - Build → Generate Signed APK (ou Run pour debug)
```

---

## Flux corrigé (étape par étape)

```
1. App ouvre → pas de token → AuthGate → state="unauthenticated"
2. openLogin() → @capacitor/browser ouvre Chrome avec :
   https://app.base44.com/login?app_id=XXX&redirect_uri=https://silga-dispatch-go.base44.app
3. Utilisateur se connecte (email/password ou Google)
4. Base44 redirige Chrome vers :
   https://silga-dispatch-go.base44.app/?access_token=TOKEN
5. Android détecte l'URL → intent-filter → rouvre SILGAPP
6. @capacitor/app déclenche appUrlOpen avec l'URL complète
7. Le listener dans base44Client.js extrait le token, le stocke dans localStorage
8. window.location.href = '/' → app recharge
9. base44Client.js lit le token depuis localStorage → createClient() avec token
10. AuthGate → isAuthenticated() = true → routage normal
```

---

## Différence avec l'APK Base44

L'APK Base44 utilise exactement ce mécanisme en interne, mais avec un domaine configuré
côté plateforme. Votre build local reproduit maintenant le même comportement.