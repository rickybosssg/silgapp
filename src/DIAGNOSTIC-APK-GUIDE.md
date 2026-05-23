# 🧪 Diagnostic APK Android - Guide Complet

## Problème
Le code livreur fonctionne dans le preview Base44 mais pas dans l'APK Android.

## Solution appliquée

### 1. Logs détaillés ajoutés
Les fichiers suivants ont été enrichis en logs console :

- **`lib/nativeLivreurApi.js`** - Logs sur :
  - Détection runtime (NATIF vs WEB)
  - Appels API backend
  - Réponses reçues
  - Erreurs détaillées

- **`lib/codeIdentificationAuth.js`** - Logs sur :
  - Code saisi
  - Chemin utilisé (NATIF vs WEB)
  - Résultat recherche livreur
  - Validation statut
  - Session créée/relue
  - Échecs avec raisons exactes

- **`lib/AuthContext.jsx`** - Logs sur :
  - Check session au démarrage
  - Session restaurée
  - Sign in réussi/échoué

### 2. Page de diagnostic créée
**Route : `/diagnostic-apk`**

Cette page permet de :
- Tester un code livreur en direct
- Voir tous les logs détaillés
- Identifier le runtime (APK vs Preview)
- Comprendre exactement où ça échoue

## Comment utiliser le diagnostic

### Dans l'APK Android :

1. **Ouvrir l'APK**
2. **Aller sur** : `/diagnostic-apk` (à ajouter dans le routing)
3. **Saisir le code** : `LVR-TES666`
4. **Cliquer sur "Tester"**
5. **Lire les logs** :
   - ✅ Vert = Succès
   - ❌ Rouge = Erreur
   - ℹ️ Gris = Info

### Logs à surveiller :

#### ✅ Si ça marche :
```
[NativeLivreurApi] isNativeLivreurRuntime: true
[CodeIdentificationAuth] Using NATIVE path (verifyNativeLivreurCode)
[NativeLivreurApi] verifyNativeLivreurCode - code: LVR-TES666
[NativeLivreurApi] Calling function: nativeLivreur
[NativeLivreurApi] Response received: {livreur: {...}}
[CodeIdentificationAuth] ✅ Livreur found: TEST 2
[CodeIdentificationAuth] ✅ Session saved for: TEST 2
```

#### ❌ Si ça échoue :
Cherchez les messages :
- `❌ FAILED` - Identifie la raison exacte
- `Error` - Message d'erreur précis
- `undefined` - Problème de données

## Étapes de build

### 1. Build web
```bash
npm run build
```

### 2. Sync Capacitor
```bash
npx cap sync android
```

### 3. Clean Gradle
```bash
cd android
./gradlew clean
```

### 4. Build APK
```bash
./gradlew assembleDebug
```

### 5. Désinstaller ancienne APK
```bash
adb uninstall com.silgapp2.app
```

### 6. Installer nouvelle APK
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Test de validation

### Code test : **LVR-TES666**

**Résultat attendu :**
1. Dashboard livreur s'ouvre
2. Nom affiché : "TEST 2"
3. Statut : Disponible/En course/Hors ligne
4. Bouton "Je suis en ligne" fonctionnel
5. Historique accessible

### Si ça ne marche toujours pas :

#### Option 1 : Via ADB logs
```bash
adb logcat | grep -E "NativeLivreurApi|CodeIdentificationAuth|AuthContext"
```

#### Option 2 : Via Chrome DevTools
1. Ouvrir `chrome://inspect/#devices`
2. Sélectionner l'appareil Android
3. Inspecter la WebView SILGAPP 2
4. Ouvrir Console
5. Tester le code dans la page `/diagnostic-apk`

#### Option 3 : Page de test alternative
Utiliser `/test-code-livreur` qui teste directement `findLivreurByCode`

## Checklist debugging

- [ ] APK installée proprement (ancienne désinstallée)
- [ ] Code test : LVR-TES666
- [ ] Logs ADB activés
- [ ] Chrome DevTools connecté
- [ ] Runtime détecté comme "NATIVE"
- [ ] Appel backend `nativeLivreur` confirmé
- [ ] Réponse backend reçue
- [ ] Livreur trouvé
- [ ] Session sauvegardée
- [ ] Dashboard ouvert

## Architecture des appels

### Preview Web (ça marche)
```
findLivreurByCode()
  → base44.functions.invoke('findLivreurByCode', {code})
    → functions/findLivreurByCode
      → Retourne livreur
```

### APK Android (à corriger)
```
findLivreurByIdentificationCode()
  → isNativeLivreurRuntime() = true
    → verifyNativeLivreurCode()
      → nativeLivreurInvoke({action: 'verifyCode', code})
        → base44.functions.invoke('nativeLivreur', {action: 'verifyCode', code})
          → functions/nativeLivreur
            → action === 'verifyCode'
              → findLivreurByCode()
                → Retourne livreur
```

Les deux chemins doivent retourner le même livreur.

## Fichiers modifiés

1. **`lib/nativeLivreurApi.js`** - Logs ajoutés
2. **`lib/codeIdentificationAuth.js`** - Logs ajoutés
3. **`pages/DiagnosticAPK`** - Nouvelle page de test
4. **`AuthenticatedRoutes.jsx`** - Route `/diagnostic-apk` ajoutée

## Prochaines étapes

1. **Build** l'APK avec les nouveaux logs
2. **Installer** proprement (désinstaller l'ancienne)
3. **Tester** avec LVR-TES666
4. **Lire** les logs dans `/diagnostic-apk`
5. **Identifier** l'étape exacte qui échoue
6. **Corriger** en fonction des logs

## Support

Si après le build et les logs, le problème persiste :

1. Capturer les logs complets
2. Identifier l'étape échouée
3. Vérifier :
   - La fonction backend `nativeLivreur` est déployée
   - L'action `verifyCode` est gérée
   - Le livreur LVR-TES666 existe en base
   - Le livreur est `valide` et `actif