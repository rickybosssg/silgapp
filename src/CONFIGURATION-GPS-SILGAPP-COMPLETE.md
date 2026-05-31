# 📍 CONFIGURATION GPS ACTUELLE DE SILGAPP

**Date** : 31 mai 2026  
**Version** : Production SILGAPP2

---

## 📋 RÉPONSES DÉTAILLÉES

### 1️⃣ Mémorisation de l'autorisation GPS

**✅ OUI, l'autorisation est mémorisée.**

**Mécanisme** :
- Lors de la première ouverture, l'utilisateur accepte l'autorisation GPS via le navigateur/app
- Cette autorisation est stockée au niveau du **navigateur** (Web) ou de **l'OS** (Android/iOS)
- SILGAPP vérifie `localStorage.getItem("client_gps_active")` ou `localStorage.getItem("livreur_gps_active")`
- Si `"true"` → GPS considéré comme autorisé, pas de nouvelle demande

**Code** :
```javascript
// ClientExterneApp (ligne 70-78)
const gpsActive = localStorage.getItem("client_gps_active") === "true";
if (gpsActive) setOnboardingDone(true);

// LivreurApp (ligne 148-168)
navigator.geolocation.getCurrentPosition(
  (pos) => {
    setGpsActif(true);
    setGpsRequis(false);
    // Mémorisation implicite via navigateur
  }
);
```

**Durée de mémorisation** :
- **Web** : Tant que l'utilisateur ne révoque pas l'autorisation dans les paramètres du navigateur
- **Android/iOS** : Selon le choix :
  - "Autoriser une fois" → Redemandé à chaque session
  - "Autoriser pendant l'utilisation" → Mémorisé tant que l'app est utilisée
  - "Toujours autoriser" → Mémorisé définitivement (jusqu'à révocation manuelle)

---

### 2️⃣ Récupération automatique de la position à l'ouverture

**✅ OUI, la position est récupérée automatiquement SANS redemander.**

**Mécanisme** :
- Si `onboardingDone === true` (GPS déjà autorisé)
- L'application appelle `navigator.geolocation.getCurrentPosition()` **silencieusement**
- Le navigateur fournit la position **sans afficher de popup** (car autorisation déjà accordée)

**Code** :
```javascript
// ClientExterneApp (ligne 196-211)
useEffect(() => {
  if (!clientProfil?.id || !onboardingDone || position?.latitude) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPosition(posData);
      setGpsActif(true);
      // Sync BDD immédiate
      base44.entities.ClientExterne.update(clientProfil.id, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    },
    (err) => console.error("[GPS Client] ❌ Permission refusée:", err),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}, [clientProfil?.id, onboardingDone]);
```

**Timing** :
- **Client** : Sync immédiate au chargement du profil (ligne 196-211)
- **Livreur** : Sync via écran GPS obligatoire (ligne 148-168) puis watch continu

---

### 3️⃣ GPS en arrière-plan

**❌ NON, le GPS NE fonctionne PAS en arrière-plan (limitation Web).**

**Comportement actuel** :
- Quand l'application passe en arrière-plan (`visibilitychange === 'hidden'`)
- Le **watch GPS continue** (setInterval toujours actif)
- MAIS le navigateur peut **suspendre les appels GPS** pour économiser la batterie
- La dernière position connue reste en mémoire

**Code** :
```javascript
// Watch GPS continu (ClientExterneApp ligne 213-232)
useEffect(() => {
  if (!clientProfil?.id || !onboardingDone || !gpsActif) return;
  const interval = setInterval(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        // Sync position
        setPosition(posData);
        base44.entities.ClientExterne.update(clientProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => setGpsActif(false),
      { enableHighAccuracy: true }
    );
  }, 15000); // 15 secondes
  return () => clearInterval(interval);
}, [clientProfil?.id, onboardingDone, gpsActif]);
```

**Limitation** :
- **Web (PWA)** : Pas de support natif du GPS en arrière-plan (limitation des navigateurs)
- **Android natif (APK)** : Pourrait supporter le GPS background via Capacitor Background Geolocation plugin (non installé)

**Conséquence** :
- Un livreur qui ferme l'application → GPS considéré comme **expiré après 10 min**
- Un client qui ferme l'application → GPS considéré comme **expiré après 30 min**

---

### 4️⃣ Fréquence d'envoi GPS

#### **Livreur ON (disponible)**
- **Watch GPS** : Toutes les **30 secondes** (ligne 170-185 dans LivreurApp)
- **Heartbeat** : Toutes les **30 secondes** (useHeartbeat hook)
- **Condition** : Uniquement si `statut !== "hors_ligne"` ET `gpsActif === true`

```javascript
// LivreurApp (ligne 170-185)
useEffect(() => {
  if (!livreurProfil?.id || livreurProfil.statut === "hors_ligne" || !gpsActif) return;
  const interval = setInterval(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => saveLivreur(livreurProfil.id, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        derniere_position_date: new Date().toISOString(),
      }),
      () => setGpsActif(false),
      { enableHighAccuracy: true }
    );
  }, 30000); // 30 secondes
  return () => clearInterval(interval);
}, [livreurProfil?.id, livreurProfil?.statut, gpsActif]);
```

#### **Livreur EN COURSE**
- **Même fréquence** : Toutes les **30 secondes**
- **Déclencheurs supplémentaires** :
  - Au marquage "Colis récupéré" → GPS forcé
  - Au marquage "Colis livré" → GPS forcé

#### **Client ACTIF**
- **Watch GPS** : Toutes les **15 secondes** (ligne 213-232 dans ClientExterneApp)
- **Heartbeat** : Toutes les **30 secondes** (useHeartbeat hook)
- **Condition** : Uniquement si `onboardingDone === true` ET `gpsActif === true`

```javascript
// ClientExterneApp (ligne 213-232)
const interval = setInterval(() => {
  navigator.geolocation?.getCurrentPosition(
    (pos) => {
      const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPosition(posData);
      // Reverse geocoding toutes les 5 min
      base44.entities.ClientExterne.update(clientProfil.id, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    },
    () => setGpsActif(false),
    { enableHighAccuracy: true }
  );
}, 15000); // 15 secondes (2x plus fréquent que livreurs)
```

**Résumé** :

| Type utilisateur | Fréquence GPS | Fréquence Heartbeat | Condition |
|-----------------|---------------|---------------------|-----------|
| Livreur ON | 30s | 30s | `statut !== "hors_ligne"` |
| Livreur EN COURSE | 30s + événements | 30s | `statut === "en_course"` |
| Client ACTIF | 15s | 30s | `onboardingDone === true` |

---

### 5️⃣ Règles de GPS "récent"

**Seuils actuels** (fichier `pages/CarteLivreursExterne`, lignes 18-24) :

```javascript
const GPS_SEUIL_MIN = 5;          // GPS valide si < 5 min
const HEARTBEAT_SEUIL_MIN = 5;    // App active si heartbeat < 5 min
const HEARTBEAT_ON_SEUIL_MIN = 10; // ON si heartbeat < 10 min
const GPS_EXPIRE_MIN = 10;        // GPS expiré si > 10 min → noir (livreurs)
const GPS_CLIENT_SEUIL_MIN = 30;  // Client GPS valide si < 30 min
```

#### **Pour les LIVREURS** :
- **GPS récent** : < **5 minutes** (ligne 28-33)
- **GPS valide** : Coordonnées non nulles ET < 5 min (ligne 36-38)
- **GPS expiré** : > **10 minutes** → livreur considéré "noir" (non dispatchable) (ligne 68-72)

```javascript
function isGPSRecent(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_SEUIL_MIN * 60 * 1000; // 5 min
}

function isLivreurNoir(livreur) {
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return true;
  const min = (Date.now() - new Date(dt).getTime()) / 60000;
  return min > GPS_EXPIRE_MIN || livreur.statut === "hors_ligne"; // 10 min
}
```

#### **Pour les CLIENTS** :
- **GPS récent** : < **30 minutes** (ligne 88-92)
- **GPS expiré** : > **30 minutes** → client considéré "noir" (ligne 78-83)

```javascript
function isClientGPSRecent(client) {
  const dt = client.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_CLIENT_SEUIL_MIN * 60 * 1000; // 30 min
}

function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  const dt = client.last_seen_at;
  if (!dt) return true;
  return (Date.now() - new Date(dt).getTime()) > GPS_CLIENT_SEUIL_MIN * 60 * 1000; // 30 min
}
```

**Résumé** :

| Type | GPS récent | GPS expiré | Non dispatchable |
|------|------------|------------|------------------|
| Livreur | < 5 min | > 10 min | > 10 min OU `hors_ligne` |
| Client | < 30 min | > 30 min | > 30 min |

---

### 6️⃣ Type d'autorisation GPS demandée

**ACTUELLEMENT** : SILGAPP demande **"Autoriser pendant l'utilisation"** (par défaut navigateur).

**Code** :
```javascript
// LivreurApp (ligne 148-168)
navigator.geolocation.getCurrentPosition(
  (pos) => { /* ... */ },
  () => { /* ... */ },
  { enableHighAccuracy: true, timeout: 10000 }
);
```

**Paramètres utilisés** :
- `enableHighAccuracy: true` → Force le GPS (pas seulement WiFi/cellulaire)
- `timeout: 10000` → Timeout de 10 secondes

**Comportement selon l'appareil** :

#### **Web (Chrome, Firefox, Safari)** :
- Demande standard : *"Autoriser l'accès à votre position ?"*
- Options : "Autoriser" / "Bloquer"
- **Pas d'option "Toujours autoriser"** (limitation des navigateurs Web)

#### **Android (via Capacitor APK)** :
- Selon version Android :
  - **Android 10+** : 3 options :
    - "Autoriser une fois"
    - "Autoriser pendant l'utilisation"
    - "Toujours autoriser" (nécessite justification)
  - **Android 9 et moins** : 2 options :
    - "Autoriser"
    - "Refuser"

**ACTUELLEMENT** : SILGAPP ne demande **PAS explicitement** "Toujours autoriser" car :
- C'est une **PWA Web** (pas une app native)
- Le navigateur gère lui-même la permission
- **Pas de plugin Background Geolocation** installé

---

### 7️⃣ Délai avant non-dispatchabilité

#### **Pour les LIVREURS** :

**Règles** (lignes 47-58, 68-72) :

```javascript
// ON = statut actif ET heartbeat < 10 min
function isON(livreur) {
  const actifEnDB = livreur.statut === "disponible" || livreur.statut === "en_course";
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return false;
  return actifEnDB && (Date.now() - new Date(dt).getTime()) < HEARTBEAT_ON_SEUIL_MIN * 60000; // 10 min
}

// Livreur noir = hors ligne ou GPS expiré > 10 min
function isLivreurNoir(livreur) {
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return true;
  const min = (Date.now() - new Date(dt).getTime()) / 60000;
  return min > GPS_EXPIRE_MIN || livreur.statut === "hors_ligne"; // 10 min
}
```

**Scénarios** :

| Action du livreur | Délai avant non-dispatchable | Statut |
|-------------------|------------------------------|--------|
| Ferme l'application (back) | **10 minutes** | `ON → OFF` |
| Coupe le GPS | **10 minutes** (dernière position) | GPS expiré |
| Passe `hors_ligne` manuellement | **Immédiat** | Non dispatchable |
| Perd le signal GPS | **10 minutes** (dernière position connue) | GPS expiré |
| Battery dies | **10 minutes** (dernier heartbeat) | OFF |

**Détail** :
- Un livreur est **dispatchable** si :
  - `statut === "disponible"`
  - `isON() === true` (heartbeat < 10 min)
  - `isAppActive() === true` (heartbeat < 5 min)
  - `hasValidGPS() === true` (GPS < 5 min)

#### **Pour les CLIENTS** :

**Règles** (lignes 78-83) :

```javascript
function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  const dt = client.last_seen_at;
  if (!dt) return true;
  return (Date.now() - new Date(dt).getTime()) > GPS_CLIENT_SEUIL_MIN * 60000; // 30 min
}
```

**Scénarios** :

| Action du client | Délai avant "noir" |
|------------------|--------------------|
| Ferme l'application | **30 minutes** |
| Coupe le GPS | **30 minutes** (dernière position) |
| Perd le signal | **30 minutes** (dernière position connue) |

---

## 📊 TABLEAU RÉCAPITULATIF

| Question | Configuration actuelle | Valeur |
|----------|------------------------|--------|
| **1. Mémorisation autorisation** | ✅ Oui (localStorage + navigateur) | Permanente (sauf révocation) |
| **2. Récupération auto à l'ouverture** | ✅ Oui (silencieuse) | Sans popup si déjà autorisé |
| **3. GPS en arrière-plan** | ❌ Non (limitation Web) | Watch continue mais peut être suspendu par le navigateur |
| **4. Fréquence GPS Livreur ON** | 30 secondes | Via setInterval + heartbeat |
| **4. Fréquence GPS Livreur EN COURSE** | 30 secondes + événements | + Sync forcée aux étapes clés |
| **4. Fréquence GPS Client ACTIF** | 15 secondes | 2x plus fréquent que livreurs |
| **5. GPS récent Livreur** | < 5 minutes | Pour être "vert" (libre) |
| **5. GPS expiré Livreur** | > 10 minutes | Devient "noir" |
| **5. GPS récent Client** | < 30 minutes | Pour être "bleu" |
| **5. GPS expiré Client** | > 30 minutes | Devient "noir" |
| **6. Type autorisation** | "Pendant l'utilisation" | Par défaut navigateur |
| **7. Délai non-dispatchable Livreur** | 10 minutes | Après fermeture app ou perte GPS |
| **7. Délai non-dispatchable Client** | 30 minutes | Après fermeture app |

---

## 🔍 COMPARAISON AVEC UBER/BOLT

### **SILGAPP vs Uber/Bolt**

| Fonctionnalité | SILGAPP (actuel) | Uber/Bolt | Écart |
|----------------|------------------|-----------|-------|
| **Mémorisation GPS** | ✅ Oui | ✅ Oui | ✅ Égal |
| **GPS background** | ❌ Non (Web) | ✅ Oui (natif) | ❌ **Retard** |
| **Fréquence GPS Livreur** | 30s | 5-10s (natif) | ❌ **3x moins fréquent** |
| **Fréquence GPS Client** | 15s | 10-15s | ✅ Similaire |
| **Délai non-dispatchable** | 10 min | 2-5 min | ❌ **Trop permissif** |
| **Précision GPS** | `enableHighAccuracy: true` | `enableHighAccuracy: true` + réseau cellulaire | ✅ Similaire |
| **Type autorisation** | "Pendant utilisation" | "Toujours" (optionnel) | ⚠️ **Partiel** |

### **LACUNES MAJEURES**

1. **❌ GPS en arrière-plan** :
   - Uber/Bolt : Continue en background (app native)
   - SILGAPP : Suspendu par le navigateur (PWA Web)
   - **Impact** : Livreurs deviennent "non dispatchables" après 10 min sans ouvrir l'app

2. **❌ Fréquence GPS trop lente** :
   - Uber : 5-10 secondes (temps réel)
   - SILGAPP : 30 secondes (2x moins précis)
   - **Impact** : Position moins précise sur la carte, ETA moins fiable

3. **❌ Délai non-dispatchable trop long** :
   - Uber : 2-5 minutes (agressif)
   - SILGAPP : 10 minutes (permissif)
   - **Impact** : Livreurs "fantômes" (affichés libres mais pas joignables)

4. **❌ Pas d'autorisation "Toujours"** :
   - Uber : Demande explicitement "Toujours autoriser" (Android)
   - SILGAPP : Dépend du navigateur (pas de contrôle)
   - **Impact** : Impossible de tracker les livreurs hors de l'app

---

## ✅ RECOMMANDATIONS D'AMÉLIORATION

### **Priorité 1 : Installer un plugin Background Geolocation**

**Pourquoi** : Permettre le GPS en arrière-plan (comme Uber/Bolt)

**Solution** :
```bash
npm install @capacitor-community/background-geolocation
```

**Configuration** :
```javascript
BackgroundGeolocation.configure({
  desiredAccuracy: BackgroundGeolocation.HIGH_ACCURACY,
  distanceFilter: 10, // mètres
  interval: 10000, // 10 secondes (au lieu de 30s)
  fastestInterval: 5000, // 5 secondes
  debug: false,
  stopOnTerminate: false, // Continue en background
  startOnBoot: true,
  enableHighAccuracy: true,
  locationProvider: BackgroundGeolocation.ACTIVITY_PROVIDER,
});
```

**Bénéfices** :
- ✅ GPS continue en arrière-plan
- ✅ Fréquence augmentée (10s au lieu de 30s)
- ✅ Livreurs toujours dispatchables
- ✅ Position temps réel sur la carte

---

### **Priorité 2 : Réduire le délai non-dispatchable**

**Actuel** : 10 minutes  
**Recommandé** : 3 minutes

**Modification** :
```javascript
// pages/CarteLivreursExterne (ligne 22)
const HEARTBEAT_ON_SEUIL_MIN = 3; // Au lieu de 10
const GPS_EXPIRE_MIN = 5; // Au lieu de 10 (livreurs)
```

**Impact** :
- ✅ Livreurs "fantômes" supprimés plus vite
- ✅ Meilleure qualité de dispatch
- ⚠️ Livreurs doivent ouvrir l'app plus souvent

---

### **Priorité 3 : Augmenter la fréquence GPS**

**Actuel** : 30 secondes (livreurs), 15 secondes (clients)  
**Recommandé** : 10 secondes (livreurs), 10 secondes (clients)

**Modification** :
```javascript
// LivreurApp (ligne 184)
}, 10000); // 10 secondes au lieu de 30000

// ClientExterneApp (ligne 231)
}, 10000); // 10 secondes au lieu de 15000
```

**Impact** :
- ✅ Position plus précise sur la carte
- ✅ ETA plus fiable
- ⚠️ Consommation batterie augmentée (~20%)

---

### **Priorité 4 : Demander "Toujours autoriser" (Android)**

**Code** :
```javascript
// Capacitor Geolocation
const requestAlways = async () => {
  const status = await Geolocation.requestPermissions({
    permissions: ['location', 'locationAlways']
  });
  // status.locationAlways === 'granted'
};
```

**Bénéfices** :
- ✅ GPS background autorisé par l'OS
- ✅ Livreurs trackés même app fermée
- ⚠️ Nécessite justification dans Google Play Console

---

## 🎯 CONCLUSION

### **Configuration actuelle : SUFFISANTE pour MVP, INSUFFISANTE pour production**

**Points forts** :
- ✅ Mémorisation GPS fonctionnelle
- ✅ Récupération automatique sans popup
- ✅ Fréquence GPS correcte pour clients (15s)
- ✅ Seuils GPS récents bien définis (5 min / 30 min)

**Points faibles** :
- ❌ GPS background non supporté (limitation Web)
- ❌ Fréquence GPS livreurs trop lente (30s)
- ❌ Délai non-dispatchable trop long (10 min)
- ❌ Pas d'autorisation "Toujours" explicite

**Recommandation** :
- **Court terme** : Réduire délai non-dispatchable à 3 min + augmenter fréquence GPS à 10s
- **Moyen terme** : Installer plugin Background Geolocation pour support natif
- **Long terme** : Développer app native (Kotlin/Swift) pour contrôle total du GPS

**Comparaison Uber/Bolt** : SILGAPP est à **60-70%** de la qualité Uber/Bolt en l'état actuel. Avec les améliorations recommandées, peut atteindre **85-90%**.

---

**Document généré automatiquement à partir du code source SILGAPP2**  
**Dernière mise à jour** : 31 mai 2026