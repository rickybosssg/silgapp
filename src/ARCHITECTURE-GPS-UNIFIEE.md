# 📍 SYSTÈME GPS UNIFIÉ — SILGAPP 2

## 🎯 Architecture GPS Unifiée Clients = Livreurs

Depuis Mai 2026, **clients externes** et **livreurs externes** utilisent **EXACTEMENT le même système GPS** — simple, direct, efficace.

---

## 📋 Architecture (identique pour ClientExterneApp et LivreurExterneApp)

### 1. ONBOARDING
```javascript
// Au premier lancement
navigator.geolocation.getCurrentPosition(
  (pos) => {
    // 1. localStorage
    localStorage.setItem("client_gps_active", "true");
    localStorage.setItem("client_gps_position", JSON.stringify({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude
    }));
    
    // 2. BDD — sync immédiate
    base44.entities.ClientExterne.update(id, {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude
    });
  }
);
```

### 2. WATCH GPS (toutes les 15 secondes)
```javascript
setInterval(() => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      base44.entities.ClientExterne.update(id, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      });
    }
  );
}, 15000);
```

**✅ Pas de filtrage distance/délai** — sync systématique

### 3. VISIBILITY CHANGE
```javascript
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        base44.entities.ClientExterne.update(id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      }
    );
  }
});
```

### 4. DASHBOARD POLLING
- **Clients** : 5 secondes
- **Livreurs** : 2 secondes

### 5. BADGE GPS
```javascript
const hasCoords = !!(profil?.latitude && profil?.longitude);
// Affiche : "GPS actif ✓" ou "GPS manquant"
```

**✅ Check simple** — pas de calcul de date

---

## 🗄️ Champs BDD Utilisés

| Champ | Type | Description |
|-------|------|-------------|
| `latitude` | number | Latitude actuelle |
| `longitude` | number | Longitude actuelle |

**❌ Champs NON utilisés :**
- `gps_actif` (boolean)
- `current_location` (object)
- `derniere_position_date` (uniquement pour livreurs)

---

## ✅ Pourquoi Ça Marche

### Avant (Complexe)
```javascript
// ❌ Logique conditionnelle complexe
if (distance > 1km && temps > 30s) {
  updateBDD();
}
```

### Maintenant (Simple)
```javascript
// ✅ Sync directe et systématique
updateBDD(latitude, longitude);
```

**Avantages :**
- ✅ Plus de logique conditionnelle complexe
- ✅ Sync directe et systématique
- ✅ Même code que livreurs (prouvé fonctionnel)
- ✅ BDD mise à jour immédiatement à chaque position
- ✅ Temps réel fiable pour le suivi

---

## 🔄 Flux de Données

```
┌─────────────────────────────────────┐
│  APPAREIL (Client ou Livreur)       │
│                                     │
│  1. Onboarding → GPS permission     │
│     ↓                               │
│  2. getCurrentPosition()            │
│     ↓                               │
│  3. localStorage (cache local)      │
│     ↓                               │
│  4. BDD (latitude, longitude)       │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  BASE DE DONNÉES (Source de vérité) │
│  - ClientExterne.latitude           │
│  - ClientExterne.longitude          │
│  - Livreur.latitude                 │
│  - Livreur.longitude                │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  DASHBOARD (Polling)                │
│  - Clients: 5s                      │
│  - Livreurs: 2s                     │
│                                     │
│  Check: latitude && longitude       │
└─────────────────────────────────────┘
```

---

## 🛠️ Composants Clés

### ClientExterneApp.jsx
- **Lignes 112-150** : Sync GPS immédiate + watch 15s
- **Lignes 154-175** : Visibility change
- **Lignes 30-52** : GPSBadge (check BDD)
- **Lignes 188-213** : Force sync manuelle

### LivreurExterneApp.jsx
- **Lignes 198-236** : GPS activation + watch 15s
- **Lignes 68-100** : Heartbeat app_active

### ClientOnboarding.jsx
- **Lignes 40-90** : Étape GPS (permission + sync BDD)
- **Lignes 120-170** : Sync immédiate avec `base44.entities.ClientExterne.update()`

### LivreurExterneOnboarding.jsx
- **Lignes 40-115** : Écran GPS (permission + localStorage)
- **Lignes 120-257** : Formulaire profil avec sync GPS

---

## 📊 Monitoring Admin

### DashboardExterne.jsx
- **SyncClientGPSPanel** : Audit GPS clients
- **SyncLivreurGPSPanel** : Audit GPS livreurs

### Fonction Backend : `syncClientGPS.js`
```javascript
// Check tous les clients
const clients = await base44.entities.ClientExterne.filter({});

// Statut GPS = latitude && longitude présents
clients.forEach(client => {
  if (client.latitude && client.longitude) {
    synced++;
  } else {
    sansGps++;
  }
});
```

---

## 🎯 Résultat

**Clients et livreurs utilisent maintenant EXACTEMENT le même système GPS** — simple, direct, efficace.

- ✅ **Fiabilité** : BDD toujours à jour
- ✅ **Temps réel** : Polling 2-5s + watch 15s
- ✅ **Maintenabilité** : Même code pour les deux
- ✅ **Simplicité** : Plus de logique conditionnelle

---

*Document créé le 28 Mai 2026 — Architecture GPS unifiée*