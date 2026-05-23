# 📋 TEST FINAL APK ANDROID - SILGAPP 2

## 🎯 OBJECTIF
Validation complète de l'authentification livreur dans l'APK Android installée.

---

## 🚀 ÉTAPE 1: BUILD ET INSTALLATION

### Commande unique (tout-en-un):
```bash
chmod +x scripts/build-final-apk.sh
./scripts/build-final-apk.sh
```

### OU commande manuelle:
```bash
# 1. Build
npm run build
npx cap sync android

# 2. Clean et build APK
cd android
./gradlew clean
./gradlew assembleDebug

# 3. Désinstaller ancienne APK
adb uninstall com.silgapp2.app

# 4. Installer nouvelle APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 5. Lancer app
adb shell am start -n com.silgapp2.app/.MainActivity
```

---

## 🧪 ÉTAPE 2: TESTS DANS L'APK

### Test 1: Connexion Admin
1. Ouvrir APK
2. Onglet "Admin"
3. Identifiant: `admin`
4. PIN: (votre PIN admin)
5. **Résultat attendu**: Dashboard admin s'ouvre

### Test 2: Connexion Livreur
1. Ouvrir APK
2. Onglet "Livreur"
3. Code: `LVR-TES666`
4. **Résultat attendu**: Dashboard livreur s'ouvre

### Test 3: Dashboard Livreur
**Vérifier:**
- ✅ Nom affiché: "TEST 2"
- ✅ Menu: "Courses", "Historique", "Profil"
- ✅ Bouton "Disponibilité" présent
- ✅ Stats: "Courses du jour: 0"
- ✅ PAS de redirection vers login

### Test 4: Persistance Session
1. Fermer complètement l'APK (swipe depuis recent apps)
2. Rouvrir l'APK
3. **Résultat attendu**: Dashboard livreur s'ouvre directement (PAS de login)

---

## 🔬 ÉTAPE 3: DIAGNOSTIC COMPLET

### Accéder à la page:
**URL**: `http://<votre-app>.base44.app/diagnostic-complet`

### Exécuter les 4 tests:

#### Test 1: "Test Code"
- Entrer: `LVR-TES666`
- Cliquer: "Test Code"
- **Résultat attendu**: ✅ SUCCÈS - Livreur trouvé
  - Nom: TEST 2
  - Statut: valide | Actif
  - Code: LVR-TES666

#### Test 2: "Test Sign In"
- Cliquer: "Test Sign In"
- **Résultat attendu**: ✅ SIGN IN RÉUSSI
  - Role: livreur
  - Livreur ID: <id>
  - Code: LVR-TES666

#### Test 3: "Test Session Capacitor"
- Cliquer: "Test Session Capacitor"
- **Résultat attendu**: 
  - Capacitor: Disponible ✅
  - Sauvegarde: ✅
  - Lecture: ✅
  - Role: livreur

#### Test 4: "Test Session Stockée"
- Cliquer: "Test Session Stockée"
- **Résultat attendu**: ✅ Session trouvée et restaurée
  - Role: livreur
  - Livreur ID: <id>

---

## 📊 ÉTAPE 4: LOGS EN TEMPS RÉEL

### Terminal 1 - Logs APK:
```bash
adb logcat | grep -E "findLivreurByCode|CodeIdentificationAuth|CapacitorStorage|DIAGNOSTIC|NativeLivreur"
```

### Logs attendus (connexion réussie):
```
[CodeIdentificationAuth] ========== SIGN IN START ==========
[CodeIdentificationAuth] Attempting sign in with code: LVR-TES666
[CodeIdentificationAuth] Using NATIVE path (verifyNativeLivreurCode)
[nativeLivreurApi] verifyNativeLivreurCode - code: LVR-TES666
[findLivreurByCode] Searching for code: LVR-TES666
[findLivreurByCode] ✅ Found livreur: TEST 2
[CodeIdentificationAuth] ✅ Livreur found: TEST 2
[CapacitorStorage] Saving session: <livreur_id>
[CapacitorStorage] ✅ Session saved successfully
[CodeIdentificationAuth] ✅ Session saved for: TEST 2
[CodeIdentificationAuth] ========== SIGN IN SUCCESS ==========
```

---

## ✅ CHECKLIST VALIDATION

### Avant build:
- [ ] Code `LVR-TES666` existe dans entité Livreur
- [ ] `validation` = "valide"
- [ ] `actif` = true
- [ ] Fonction `findLivreurByCode` déployée

### Après installation APK:
- [ ] Connexion admin fonctionne
- [ ] Connexion livreur LVR-TES666 fonctionne
- [ ] Dashboard livreur s'ouvre
- [ ] Nom "TEST 2" affiché
- [ ] Menu complet visible
- [ ] PAS de redirection login

### Après fermeture/réouverture:
- [ ] Dashboard s'ouvre directement
- [ ] Session persistée
- [ ] PAS de login demandé

### Tests /diagnostic-complet:
- [ ] Test Code: ✅ VERT
- [ ] Test Sign In: ✅ VERT
- [ ] Test Session Capacitor: ✅ VERT
- [ ] Test Session Stockée: ✅ VERT

### Logs:
- [ ] `role: livreur` dans les logs
- [ ] `livreur_id: <id>` présent
- [ ] `CapacitorStorage] ✅ Session saved`
- [ ] Aucune erreur rouge

---

## 🔴 SI ÉCHEC - DIAGNOSTIC

### Échec Test Code (rouge):
**Problème**: Code non trouvé dans DB
**Solution**:
```
1. Vérifier entité Livreur dans Base44
2. Filter: {code_identification: "LVR-TES666"}
3. Si nul → Créer livreur avec code
```

### Échec Test Sign In (rouge):
**Problème**: Session non créée ou role manquant
**Fichier**: `lib/codeIdentificationAuth.js`
**Logs**: Chercher `role:` dans logs

### Échec Test Session Capacitor (rouge):
**Problème**: Capacitor Preferences non fonctionnel
**Fichier**: `lib/capacitorStorage.js`
**Logs**: Chercher `CapacitorStorage]`

### Échec Test Session Stockée (rouge):
**Problème**: Session non persistée
**Fichier**: `lib/codeIdentificationAuth.js` + `lib/capacitorStorage.js`

### Redirection vers login après fermeture:
**Problème**: Role non persisté ou session corrompue
**Fichier**: `App.jsx` → `useSilgappAuth()`
**Logs**: Vérifier `role: livreur` dans session

---

## 📋 RÉSULTAT FINAL

### Confirmation attendue:
```
✅ Testé dans APK Android installée → connexion livreur opérationnelle.

Détails:
- Connexion admin: ✅
- Connexion livreur LVR-TES666: ✅
- Dashboard livreur: ✅ (nom: TEST 2, menu complet)
- Persistance session: ✅ (après fermeture/réouverture)
- Redirection login: ❌ (aucune)
- Tests /diagnostic-complet: ✅ (4/4 verts)
- Logs APK: ✅ (role: livreur confirmé)
```

### Si tout est vert:
**L'authentification livreur est 100% opérationnelle dans l'APK Android.**

### Si un test échoue:
1. Noter l'étape exacte qui échoue
2. Copier les logs correspondants
3. Identifier le fichier responsable
4. Corriger et régénérer APK

---

## 🎯 COMMANDE FINALE

```bash
# Build + install + logs
./scripts/build-final-apk.sh

# Puis dans un autre terminal:
adb logcat | grep -E "findLivreurByCode|CodeIdentificationAuth|CapacitorStorage|DIAGNOSTIC"
```

**Durée estimée**: 2-3 minutes pour le build complet.