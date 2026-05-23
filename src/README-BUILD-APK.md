# 🚀 SILGAPP 2 - BUILD & INSTALL APK

## ✅ VERSION STABLE ACTUELLE

- ✅ Admin login fonctionne
- ✅ Livreur login fonctionne  
- ✅ Session persiste après fermeture/réouverture
- ✅ Navigation fluide

---

## 📋 PROCÉDURE DE BUILD (OBLIGATOIRE)

### Option 1: Build Complet (Recommandé)

```bash
./scripts/build-stable-apk.sh
```

**Ce que fait le script :**
1. `npm run build` - Build web
2. `npx cap sync android` - Sync Capacitor
3. `cd android` - Navigation dossier
4. `./gradlew clean` - Nettoyage Gradle
5. `./gradlew assembleDebug` - Build APK

**Résultat :** `android/app/build/outputs/apk/debug/app-debug.apk`

---

### Option 2: Build Rapide

```bash
./scripts/quick-build-stable.sh
```

---

### Option 3: Build + Install Automatique

```bash
./scripts/full-rebuild-install.sh
```

**Ce que fait :**
- Build complet
- Désinstallation ancienne version
- Installation nouvelle version

---

## 📲 INSTALLATION MANUELLE

### 1. Copier l'APK

```bash
adb pull android/app/build/outputs/apk/debug/app-debug.apk ./silgapp2-stable.apk
```

### 2. Désinstaller l'ancienne version

**Sur le téléphone :**
- Paramètres → Applications → Silga → Désinstaller

**Via ADB :**
```bash
adb uninstall com.silga.livraison
```

### 3. Installer la nouvelle APK

**Méthode simple :**
- Transférer APK sur téléphone
- Ouvrir gestionnaire de fichiers
- Taper sur `silgapp2-stable.apk`
- Autoriser installation

**Via ADB :**
```bash
adb install -r silgapp2-stable.apk
```

---

## 🧪 TESTS OBLIGATOIRES

### Test 1 : Login Admin
- **Identifiant :** `admin`
- **PIN :** `2468`
- **Résultat attendu :** Accès dashboard

### Test 2 : Login Livreur
- **Code :** `LVR-TES666`
- **Résultat attendu :** Accès app livreur

### Test 3 : Fermeture/Réouverture
1. Fermer complètement l'app (swipe pour fermer)
2. Rouvrir l'app
3. **Résultat attendu :** Session persiste, pas de re-login

### Test 4 : Navigation
- **Admin :** Tester toutes les pages (Dashboard, Livreurs, Courses, etc.)
- **Livreur :** Tester statut, courses, historique

---

## 📊 MONITORING & LOGS

### Voir les logs en temps réel

```bash
./scripts/test-apk.sh
```

**Ou manuellement :**
```bash
adb logcat | grep -i silga
```

### Logs spécifiques auth

```bash
adb logcat | grep -E "(Auth|Login|Session)"
```

### Logs stockage Capacitor

```bash
adb logcat | grep -i capacitor
```

---

## 🔧 COMMANDES ADB UTILES

```bash
# Installer APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Désinstaller
adb uninstall com.silga.livraison

# Force stop
adb shell am force-stop com.silga.livraison

# Effacer données (reset complet)
adb shell pm clear com.silga.livraison

# Vérifier installation
adb shell pm list packages | grep silga

# Voir version installée
adb shell dumpsys package com.silga.livraison | grep version
```

---

## ❌ PROBLÈMES FRÉQUENTS

### "App not installed"
**Solution :** Désinstaller l'ancienne version d'abord
```bash
adb uninstall com.silga.livraison
```

### "Parse error"
**Cause :** APK corrompue  
**Solution :** Refaire le build
```bash
./scripts/build-stable-apk.sh
```

### Login livreur échoue
**Vérifier :** Code dans entity Livreur
```bash
# Dans le preview, tester code LVR-TES666
```

### Session ne persiste pas
**Diagnostiquer :**
```bash
adb logcat | grep -E "(Storage|Capacitor|Session)"
```

---

## ✅ CHECKLIST VALIDATION

Avant de considérer l'APK comme stable :

- [ ] Login admin fonctionne
- [ ] Login livreur fonctionne
- [ ] Session persiste après fermeture
- [ ] Navigation fluide (toutes pages)
- [ ] Pas d'erreurs dans logs
- [ ] Notifications push (si testées)
- [ ] GPS/position (pour livreurs)

---

## 📞 SUPPORT

En cas de problème :

1. **Capturer les logs :**
   ```bash
   adb logcat > logs.txt
   ```

2. **Identifier l'erreur :**
   - Chercher "ERROR" ou "FATAL"
   - Noter le message complet

3. **Vérifier :**
   - Version Android du téléphone
   - Espace disque disponible
   - Permissions accordées

---

**Dernière mise à jour :** 2026-05-23  
**Version stable :** Admin + Livreur fonctionnels ✅