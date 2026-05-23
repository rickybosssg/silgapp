# 📱 Guide de Build APK Android - SILGAPP 2

## Problème corrigé
Le fichier `lib/nativeLivreurApi.js` appelait incorrectement la fonction `getNotificationStats` au lieu de `nativeLivreur`. Cette correction permet à l'APK Android de communiquer correctement avec le backend pour la vérification des codes livreurs.

## Commandes de Build

### Option 1 : Script automatique (recommandé)
```bash
chmod +x build-apk.sh
./build-apk.sh
```

### Option 2 : Commandes manuelles
```bash
# 1. Nettoyer
rm -rf dist
rm -rf android/app/build/outputs/apk

# 2. Build web
npm run build

# 3. Sync Capacitor
npx cap sync android

# 4. Clean Gradle
cd android
./gradlew clean

# 5. Build APK
./gradlew assembleDebug
```

## Installation de la nouvelle APK

### Étape 1 : Désinstaller l'ancienne version
```bash
adb uninstall com.silgapp2.app
```

### Étape 2 : Installer la nouvelle version
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Étape 3 : Tester
1. Ouvrir l'application SILGAPP 2
2. Se connecter avec le code : **LVR-TES666**
3. Vérifier que le dashboard livreur s'affiche correctement

## Vérifications importantes

### ✅ Avant le build
- [ ] Les modifications de code sont sauvegardées
- [ ] Le fichier `lib/nativeLivreurApi.js` a été corrigé
- [ ] Le fichier `functions/findLivreurByCode` existe

### ✅ Après le build
- [ ] L'APK a été générée dans `android/app/build/outputs/apk/debug/`
- [ ] La taille de l'APK est raisonnable (~20-50 MB)
- [ ] L'ancienne APK a été désinstallée
- [ ] La nouvelle APK a été installée
- [ ] Le test de connexion fonctionne

## Debugging APK

### Activer le debug WebView
Dans `capacitor.config.json`, vérifier :
```json
{
  "android": {
    "webContentsDebuggingEnabled": true
  }
}
```

### Voir les logs Android
```bash
adb logcat | grep -i "silga\|livreur\|code"
```

### Voir les logs dans Chrome
1. Ouvrir Chrome sur desktop
2. Aller sur `chrome://inspect/#devices`
3. Sélectionner l'appareil Android
4. Inspecter la WebView SILGAPP 2

## Codes de test disponibles

| Code | Livreur | Statut |
|------|---------|--------|
| LVR-TES666 | TEST 2 | Valide, Disponible |
| LVR-TES000 | alfred test 3 | Valide |
| LVR-BAS103 | Amadou BASSOLET | Valide, Disponible |
| LVR-BAR892 | Aziz BARRO | Valide |
| LVR-YAM138 | Dominique YAMWENBA | Valide |

## Structure des appels API

### Web (Preview Base44)
```
Login → findLivreurByCode (backend function) → Session localStorage → Dashboard
```

### APK Android
```
Login → nativeLivreur { action: 'verifyCode' } → Session localStorage → Dashboard
```

Les deux utilisent maintenant la même logique de vérification.