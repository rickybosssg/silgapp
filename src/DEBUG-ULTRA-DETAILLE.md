# 🐛 DEBUG ULTRA-DÉTAILLÉ - APK Android

## 🎯 OBJECTIF
Identifier EXACTEMENT quelle étape échoue avec des logs précis (timestamp ms).

---

## 📊 COMMANDES LOGS

### Terminal 1 - Logs temps réel:
```bash
adb logcat | grep -E "DIAGNOSTIC-STEP|CapacitorStorage|CodeIdentificationAuth|SilgappAuth|NativeLivreur"
```

### Terminal 2 - Logs filtrés par test:
```bash
# Test 1: Code
adb logcat | grep "ÉTAPE [12]"

# Test 2: Sign In
adb logcat | grep "ÉTAPE [34]"

# Test 3: Session Write/Read
adb logcat | grep "ÉTAPE [34]" | grep -E "save|read"

# Test 4: Session Stockée
adb logcat | grep "Session"

# Test 5: Flux Complet
adb logcat | grep "ÉTAPE [1-7]"
```

---

## 🔍 ÉTAPES DU FLUX (à tracer)

### Test 1: "Test Code"
**Étapes:**
1. Code saisi
2. Runtime check (NATIVE vs WEB)
3. Appel backend findLivreurByCode

**Résultat attendu:**
```
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 1] 📝 Code saisi: "LVR-TES666"
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 2] 📱 Runtime: NATIVE (Capacitor)
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 3] ✅ SUCCÈS - Livreur trouvé!
```

**Si échoue:**
- ❌ Étape 1 → Problème saisie code
- ❌ Étape 2 → Capacitor non détecté
- ❌ Étape 3 → Backend ne trouve pas livreur

---

### Test 2: "Test Sign In"
**Étapes:**
1. Code saisi
2. Runtime check
3. signInWithIdentificationCode
4. User créé avec role=livreur

**Résultat attendu:**
```
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 3] 🔐 Début signInWithIdentificationCode...
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 4] ✅ SIGN IN RÉUSSI!
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 4] 🎭 Role: livreur
```

**Si échoue:**
- ❌ Étape 3 → Session non sauvegardée
- ❌ Étape 4 → role != 'livreur'

---

### Test 3: "Test Write/Read"
**Étapes:**
1. Capacitor disponible?
2. Sauvegarde session test
3. Lecture IMMÉDIATE session

**Résultat attendu:**
```
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 1] 📱 Capacitor disponible: true
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 2] 💾 Sauvegarde session test...
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 2] ✅ Session sauvegardée
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 3] 📖 Lecture session IMMÉDIATE...
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 3] ✅ Session lue avec succès!
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 3] 🎭 Role: livreur
```

**Si échoue:**
- ❌ Étape 1 → Capacitor non disponible (problème build)
- ❌ Étape 2 → saveSessionNative échoue
- ❌ Étape 3 → getSessionNative retourne null → **PROBLÈME MAJEUR**

---

### Test 4: "Test Session Stockée"
**Étapes:**
1. getStoredIdentificationSession
2. Vérification role=livreur

**Résultat attendu:**
```
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 1] ✅ Session trouvée et restaurée!
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 1] 🎭 Role: livreur
```

**Si échoue:**
- ❌ Étape 1 → Aucune session trouvée
- ❌ Role != 'livreur' → Session corrompue

---

### Test 5: "TEST FLUX COMPLET" (7 étapes)
**Étapes:**
1. Code saisi
2. Backend OK (trouve livreur)
3. Session sauvegardée (Capacitor)
4. Session relue IMMÉDIATEMENT
5. AuthContext mis à jour
6. role=livreur vérifié
7. Navigation dashboard

**Résultat attendu:**
```
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 1] 📝 Code saisi = "LVR-TES666"
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 2] ✅ Backend a trouvé le livreur
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 3] ✅ Session sauvegardée dans Capacitor
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 4] ✅ Session relue avec succès
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 5] ✅ AuthContext mis à jour
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 6] ✅ role = "livreur" confirmé
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape 7] ✅ Navigation simulée
```

**Si échoue:**
- ❌ Étape 2 → Backend ne trouve pas
- ❌ Étape 3 → Capacitor save échoue
- ❌ Étape 4 → Capacitor read échoue → **CAPE PACITOR NE RELIT PAS**
- ❌ Étape 5 → AuthContext non mis à jour
- ❌ Étape 6 → role != 'livreur'

---

## 🔴 DIAGNOSTIC PAR ÉCHEC

### Échec Étape 2 (Backend):
**Fichier:** `functions/findLivreurByCode.js`
**Logs:** Chercher `[findLivreurByCode]`
**Solution:**
```
1. Vérifier livreur existe: {code_identification: "LVR-TES666"}
2. Vérifier fonction déployée
3. Logs backend: [findLivreurByCode] Searching for code
```

### Échec Étape 3 (Save Capacitor):
**Fichier:** `lib/capacitorStorage.js` → `saveSessionNative`
**Logs:** Chercher `[CapacitorStorage]`
**Solution:**
```
1. Vérifier Capacitor Preferences installé: npm:@capacitor/preferences
2. Vérifier capacitor.config.json
3. Rebuild: npm run build && npx cap sync android
```

### Échec Étape 4 (Read Capacitor) - LE PLUS CRITIQUE:
**Fichier:** `lib/capacitorStorage.js` → `getSessionNative`
**Logs:** Chercher `[CapacitorStorage] Failed to get session`
**Solution:**
```
CAUSES POSSIBLES:
1. Capacitor Preferences écrit dans un storage, relit dans un autre
2. async/await mal géré (read avant write terminé)
3. Contexte Android différent (main thread vs worker)
4. Permissions Android manquantes

DEBUG:
- addLog(`Session JSON: ${JSON.stringify(sessionData)}`) avant save
- addLog(`Read value: ${value}`) après read
- Vérifier si value = null ou undefined

CORRECTION:
await Preferences.set(...) IMMÉDIATEMENT suivi de:
const {value} = await Preferences.get(...)
```

### Échec Étape 6 (role != 'livreur'):
**Fichier:** `lib/codeIdentificationAuth.js` → `toCodeUser`
**Logs:** Chercher `role:` dans logs
**Solution:**
```javascript
// Dans toCodeUser():
console.log('[CodeIdentificationAuth] Creating user with role:', 'livreur');
return {
  id: `livreur:${livreur.id}`,
  role: 'livreur',  // ← DOIT ÊTRE EXACTEMENT ÇA
  // ...
};
```

---

## 🧪 PROCÉDURE DE TEST

### 1. Build APK propre:
```bash
./scripts/build-final-apk.sh
```

### 2. Installer APK:
```bash
adb uninstall com.silgapp2.app
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 3. Lancer logs:
```bash
adb logcat | grep -E "DIAGNOSTIC-STEP|CapacitorStorage|CodeIdentificationAuth"
```

### 4. Ouvrir APK et aller sur:
```
/diagnostic-complet
```

### 5. Exécuter Test 5 (Flux Complet):
- Cliquer: "TEST FLUX COMPLET (7 étapes)"
- Observer logs en temps réel
- Noter NUMÉRO D'ÉTAPE qui échoue

### 6. Si échec:
- Copier logs EXACTS de l'étape qui échoue
- Identifier fichier responsable
- Corriger
- Rebuild APK
- Retester

---

## ✅ RÉSULTAT FINAL

### Si TOUS les tests sont verts:
```
✅ Testé dans APK Android installée → connexion livreur opérationnelle.

Détails:
- Étape 1 (Code): ✅
- Étape 2 (Backend): ✅
- Étape 3 (Save Capacitor): ✅
- Étape 4 (Read Capacitor): ✅
- Étape 5 (AuthContext): ✅
- Étape 6 (role=livreur): ✅
- Étape 7 (Navigation): ✅
```

### Si un test échoue:
```
❌ ÉCHEC ÉTAPE X: <description>
Fichier responsable: <fichier>
Logs exacts: <copier logs>
Correction: <à faire>
```

---

## 📋 CHECKLIST RAPIDE

- [ ] APK installée: `adb shell pm list packages | grep silgapp2`
- [ ] Logs visibles: `adb logcat | grep DIAGNOSTIC`
- [ ] Capacitor détecté: isCapacitorAvailable() = true
- [ ] Test 1 vert: Backend trouve livreur
- [ ] Test 3 vert: Capacitor write + read OK
- [ ] Test 5 vert: 7/7 étapes réussies
- [ ] role=livreur confirmé dans logs
- [ ] Dashboard s'ouvre après test

---

## 🎯 LOGS EXACTS À FOURNIR SI ÉCHEC

**Copier-coller CES logs précis:**

```
[DIAGNOSTIC-STEP] [HH:MM:SS.sss] [Étape X] <message exact>
[CapacitorStorage] <message exact>
[CodeIdentificationAuth] <message exact>
```

**Avec:**
- Timestamp exact (HH:MM:SS.sss)
- Numéro d'étape exact
- Message d'erreur exact
- Stack trace si présente

**Exemple:**
```
[DIAGNOSTIC-STEP] [14:23:45.123] [Étape 4] ❌ ÉTAPE 4 ÉCHEC: Capacitor ne relit pas la session
[CapacitorStorage] Failed to get session: Error: Native plugin not available
``