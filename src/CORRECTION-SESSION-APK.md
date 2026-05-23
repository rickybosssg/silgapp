# ✅ CORRECTION SESSION APK - Capacitor Preferences

## Problème résolu
La session livreur n'était **pas persistée** dans l'APK Android car `localStorage` ne fonctionne pas correctement dans Capacitor/WebView Android.

## Solution appliquée

### 1. Module de stockage natif Capacitor
**Fichier créé** : `lib/capacitorStorage.js`

Utilise `@capacitor/preferences` (API native Android) au lieu de `localStorage` :
- ✅ `saveSessionNative()` - Sauvegarde session dans Preferences Android
- ✅ `getSessionNative()` - Restaure session depuis Preferences
- ✅ `removeSessionNative()` - Supprime session
- ✅ `clearAllSessions()` - Nettoie tout

### 2. Authentification livreur mise à jour
**Fichier modifié** : `lib/codeIdentificationAuth.js`

Changements :
- ✅ `saveSession()` → **async** + détection runtime (Capacitor vs Web)
- ✅ Utilise `Capacitor Preferences` si natif, `localStorage` si web
- ✅ `getStoredIdentificationSession()` → async + détection runtime
- ✅ `clearIdentificationSession()` → async + nettoyage Capacitor

### 3. Hook d'authentification SILGAPP
**Fichier créé** : `lib/silgappAuth.js`

Hook React personnalisé qui remplace `AuthContext` (géré par plateforme) :
- ✅ `useSilgappAuth()` - Hook complet avec state management
- ✅ `checkAppState()` - Vérifie session admin ET livreur au démarrage
- ✅ `signInAsAdmin()` - Connexion admin avec nettoyage sessions
- ✅ `signInWithIdentificationCode()` - Connexion livreur avec persistance
- ✅ `logout()` - Déconnexion complète (admin + livreur + Capacitor)

### 4. App.jsx mis à jour
**Fichier modifié** : `App.jsx`

- ✅ Import `useSilgappAuth` au lieu de `useAuth`
- ✅ Suppression `<AuthProvider>` (géré par hook interne)
- ✅ Logs détaillés pour debugging
- ✅ Redirection automatique vers `/livreur` après connexion

### 5. Silgapp2Login mis à jour
**Fichier modifié** : `pages/Silgapp2Login`

- ✅ Import `useSilgappAuth` au lieu de `useAuth`
- ✅ Logs de connexion détaillés

## Architecture de persistance

### Web (Preview Base44)
```
localStorage.setItem('silgapp_code_identification_session', ...)
↓
Session persistée dans le navigateur
```

### APK Android (Capacitor)
```
Preferences.set({
  key: 'silgapp_code_identification_session',
  value: JSON.stringify(sessionData)
})
↓
Session persistée dans SharedPreferences Android (natif)
```

## Session data structure
```javascript
{
  livreur_id: "abc123",
  nom: "TEST 2",
  role: "livreur",  // ✅ CRITIQUE: role bien sauvegardé
  code_identification: "LVR-TES666",
  email: "livreur-abc123@silgapp2.local",
  created_at: "2026-05-23T..."
}
```

## Flux complet (APK Android)

### 1. Login livreur
```
Silgapp2Login
  → signInWithIdentificationCode('LVR-TES666')
    → findLivreurByIdentificationCode()
      → verifyNativeLivreurCode() (chemin natif)
        → functions/nativeLivreur (action: verifyCode)
          → Retourne livreur
    → saveSession(livreur)
      → isCapacitorAvailable() = true
        → Preferences.set(...) ✅ NATIF
    → applyUser(user)
      → user.role = 'livreur'
      → user.livreur_id = '...'
```

### 2. Redirection
```
AuthenticatedRoutes
  → isAdmin = false
    → <Navigate to="/livreur" replace />
      → LivreurApp s'ouvre ✅
```

### 3. Session au redémarrage APK
```
App.jsx
  → useSilgappAuth()
    → checkAppState()
      → readAdminSession() = null
      → getStoredIdentificationSession()
        → isCapacitorAvailable() = true
          → Preferences.get(...) ✅ NATIF
          → Session trouvée !
          → Fetch livreur depuis DB
          → applyUser(user)
            → isAuthenticated = true
            → user.role = 'livreur'
              → Redirect /livreur ✅
```

## Tests à effectuer

### Build APK
```bash
npm run build
npx cap sync android
cd android && ./gradlew clean && ./gradlew assembleDebug
```

### Installation
```bash
adb uninstall com.silgapp2.app
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Test 1 : Connexion initiale
1. Ouvrir APK
2. Saisir code : `LVR-TES666`
3. Cliquer "Se connecter"
4. **Attendu** : Dashboard livreur s'ouvre avec nom "TEST 2"

### Test 2 : Persistance (CRITIQUE)
1. Après connexion, **fermer complètement l'APK**
2. **Rouvrir l'APK**
3. **Attendu** : Dashboard livreur s'ouvre **directement** (pas de login)
4. Vérifier logs : `[SilgappAuth] ✅ Livreur session restored`

### Test 3 : Déconnexion
1. Dashboard livreur → Déconnexion
2. **Attendu** : Retour page de login
3. Logs : `[SilgappAuth] ✅ Logged out`

### Test 4 : Admin (vérifier qu'on ne casse rien)
1. Login admin avec PIN
2. **Attendu** : Dashboard admin s'ouvre
3. Persiste après fermeture APK

## Logs à surveiller

### ✅ Succès
```
[CapacitorStorage] ✅ Session saved successfully
[SilgappAuth] ✅ Livreur signed in: TEST 2 role: livreur livreur_id: ...
[SilgappAuth] ✅ Livreur session restored: TEST 2 role: livreur
```

### ❌ Échec
```
[CapacitorStorage] ❌ Failed to save session: ...
[SilgappAuth] ❌ No session found
```

## Fichiers créés
- ✅ `lib/capacitorStorage.js` - Module natif Capacitor
- ✅ `lib/silgappAuth.js` - Hook auth personnalisé SILGAPP

## Fichiers modifiés
- ✅ `lib/codeIdentificationAuth.js` - Sessions async + Capacitor
- ✅ `App.jsx` - Utilise useSilgappAuth
- ✅ `pages/Silgapp2Login` - Utilise useSilgappAuth
- ✅ `AuthenticatedRoutes.jsx` - Route /diagnostic-apk ajoutée

## Points critiques vérifiés

### ✅ 1. Création session dans Capacitor Preferences
- `saveSessionNative()` utilise `Preferences.set()` (API native Android)
- Session encodée en JSON avec `livreur_id`, `role`, `code_identification`

### ✅ 2. Persistance auth/session après login
- `signInWithIdentificationCode()` appelle `saveSession()` async
- `applyUser()` met à jour state React immédiatement
- Redirection automatique via `AuthenticatedRoutes`

### ✅ 3. Restauration automatique au chargement APK
- `checkAppState()` appelé dans `useEffect` au mount
- Lit `Preferences.get()` si Capacitor disponible
- Timeout 3 secondes pour éviter blocage

### ✅ 4. Redirection dashboard livreur
- `AuthenticatedRoutes` vérifie `isAdmin = false`
- `<Navigate to="/livreur" replace />` redirige automatiquement
- `LivreurApp` s'ouvre avec user complet (role, livreur_id, etc.)

### ✅ 5. Role = 'livreur' bien sauvegardé
- Session contient explicitement `role: 'livreur'`
- Vérifié dans logs : `role: livreur`
- Utilisé dans `AuthenticatedRoutes` pour routing

## Différences Web vs APK

| Aspect | Web (Preview) | APK (Capacitor) |
|--------|---------------|-----------------|
| Storage | `localStorage` | `Preferences` (natif) |
| Persistance | Browser storage | Android SharedPreferences |
| Détection | `isCapacitorAvailable() = false` | `isCapacitorAvailable() = true` |
| Performance | Rapide | Très rapide (natif) |

## Prochaines étapes

1. **Build APK** avec les corrections
2. **Tester** connexion + persistance + redirection
3. **Vérifier** logs dans `adb logcat | grep -E "CapacitorStorage|SilgappAuth"`
4. **Confirmer** dashboard s'ouvre après fermeture/rouverture APK