# 🐛 Problème APK Android - CORRIGÉ

## Problème identifié

L'APK Android ne parvenait pas à connecter les livreurs avec leur code d'identification, alors que le preview Base44 fonctionnait parfaitement.

### Cause racine

Dans `lib/nativeLivreurApi.js`, la fonction `nativeLivreurInvoke` appelait incorrectement :
```javascript
base44.functions.invoke('getNotificationStats', { ...payload, native_livreur: true })
```

Au lieu d'appeler la fonction `nativeLivreur` qui gère la vérification des codes :
```javascript
base44.functions.invoke('nativeLivreur', payload)
```

## Correction appliquée

### Fichier modifié
**`lib/nativeLivreurApi.js`**

#### Avant
```javascript
export const nativeLivreurInvoke = async (payload) => {
  const result = await base44.functions.invoke('getNotificationStats', {
    ...payload,
    native_livreur: true,
  });
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
};
```

#### Après
```javascript
export const nativeLivreurInvoke = async (payload) => {
  const result = await base44.functions.invoke('nativeLivreur', payload);
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
};
```

## Pourquoi ça ne marchait pas dans l'APK

1. **Web (preview)** : Utilise `findLivreurByCode` directement → ✅ Marche
2. **APK Android** : Utilise `nativeLivreurApi.verifyNativeLivreurCode()` → ❌ Appelait la mauvaise fonction backend

La fonction `getNotificationStats` ne gère pas l'action `verifyCode`, donc l'appel échouait.

## Solution complète

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

### 5. Désinstaller l'ancienne APK
```bash
adb uninstall com.silgapp2.app
```

### 6. Installer la nouvelle APK
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Test de validation

### Code de test
**LVR-TES666** (livreur TEST 2, compte valide et disponible)

### Résultat attendu
1. Saisie du code → Validation
2. Dashboard livreur s'affiche
3. Nom du livreur visible
4. Statut affiché (Disponible/En course/Hors ligne)
5. Bouton "Je suis en ligne" fonctionnel
6. Historique des courses accessible

## Architecture des appels API

### Web (preview Base44)
```
Silgapp2Login
  → signInWithIdentificationCode()
    → findLivreurByIdentificationCode()
      → base44.functions.invoke('findLivreurByCode', { code })
        → functions/findLivreurByCode
          → Retourne livreur
    → saveSession()
      → localStorage.setItem('silgapp_code_identification_session')
```

### APK Android
```
Silgapp2Login
  → signInWithIdentificationCode()
    → findLivreurByIdentificationCode()
      → isNativeLivreurRuntime() = true
        → verifyNativeLivreurCode()
          → nativeLivreurInvoke({ action: 'verifyCode', code })
            → base44.functions.invoke('nativeLivreur', { action: 'verifyCode', code })
              → functions/nativeLivreur
                → action === 'verifyCode'
                  → findLivreurByCode()
                    → Retourne livreur
    → saveSession()
      → localStorage.setItem('silgapp_code_identification_session')
```

Les deux chemins utilisent maintenant la même logique de vérification.

## Checklist de validation

- [x] Correction du fichier `lib/nativeLivreurApi.js`
- [x] Fonction backend `nativeLivreur` vérifiée et fonctionnelle
- [x] Fonction backend `findLivreurByCode` créée et testée
- [ ] Build web exécuté
- [ ] Sync Capacitor exécutée
- [ ] APK rebuild générée
- [ ] Ancienne APK désinstallée
- [ ] Nouvelle APK installée
- [ ] Test de connexion avec LVR-TES666 réussi
- [ ] Dashboard livreur accessible
- [ ] Navigation fonctionnelle
- [ ] Push notifications fonctionnelles

## Scripts disponibles

### Build complet
```bash
./scripts/build-android.sh
```

### Build rapide
```bash
./scripts/quick-build.sh
```

### Fix + Build
```bash
./scripts/fix-and-build.sh
```

## Fichiers créés

- `BUILD-ANDROID.md` - Guide complet de build
- `INSTALL-APK.md` - Guide d'installation
- `build-apk.sh` - Script de build
- `scripts/build-android.sh` - Script complet
- `scripts/quick-build.sh` - Build rapide
- `scripts/fix-and-build.sh` - Correction + build

## Support

Si le problème persiste après le rebuild :

1. Vérifier les logs ADB :
```bash
adb logcat | grep -i "silga\|livreur\|code"
```

2. Inspecter via Chrome :
   - `chrome://inspect/#devices`
   - Sélectionner l'appareil Android
   - Inspecter la WebView

3. Nettoyer le cache :
```bash
adb shell pm clear com.silgapp2.app
```

4. Réinstaller proprement :
```bash
adb uninstall com.silgapp2.app
adb install android/app/build/outputs/apk/debug/app-debug.apk
``