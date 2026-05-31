# 📍 GPS BACKGROUND - APK BASE44

**Date** : 31 mai 2026  
**Contrainte** : APK généré automatiquement par Base44 (pas de configuration Android personnalisée)

---

## ⚠️ LIMITATION

L'APK Base44 est **pré-compilé** avec une configuration Capacitor standard. Impossible d'ajouter :
- ❌ Plugins natifs personnalisés (`@capacitor-community/background-geolocation`)
- ❌ Permissions Android custom (`ACCESS_BACKGROUND_LOCATION`)
- ❌ Services foreground personnalisés

---

## ✅ SOLUTION : GPS WEB STANDARD

Utiliser **uniquement** les API web natives disponibles dans l'APK Base44 :

### **1. Geolocation API (navigateur)**

```javascript
navigator.geolocation.watchPosition(
  (position) => {
    const { latitude, longitude } = position.coords;
    // Sync vers BDD
  },
  (error) => console.error(error),
  {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  }
);
```

**Limitations** :
- ⚠️ Suspendu en background (écran verrouillé)
- ⚠️ Dépend du navigateur (Chrome Android)
- ✅ Fonctionne écran allumé

---

### **2. Heartbeat toutes les 30s**

```javascript
// hooks/useHeartbeat.js (DÉJÀ EXISTANT)
useEffect(() => {
  const interval = setInterval(async () => {
    if (document.visibilityState === 'visible') {
      // Récupérer position GPS
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await base44.entities.Livreur.update(livreurId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        });
      });
    }
  }, 30000); // 30 secondes
  
  return () => clearInterval(interval);
}, []);
```

---

### **3. Background Sync (limité)**

```javascript
// Utiliser Background Sync API (si supporté)
if ('serviceWorker' in navigator && 'SyncManager' in window) {
  const registration = await navigator.serviceWorker.ready;
  await registration.sync.register('sync-gps');
}
```

**Limitations** :
- ⚠️ Non supporté sur iOS
- ⚠️ Support partiel sur Android Chrome

---

## 🔧 CONFIGURATION APK BASE44

### **Permissions incluses** (par défaut) :

L'APK Base44 inclut déjà :
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

**Manquant** :
```xml
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<!-- ❌ Non disponible dans APK Base44 standard -->
```

---

## 📊 COMPARAISON

| Fonctionnalité | APK Custom | APK Base44 |
|----------------|------------|------------|
| **GPS background** | ✅ Oui (plugin) | ⚠️ Limité |
| **Écran verrouillé** | ✅ Oui | ❌ Non |
| **Permission "Toujours"** | ✅ Oui | ⚠️ "Pendant utilisation" |
| **Fréquence GPS** | 10s | 30s (heartbeat) |
| **Setup** | Complexe | ✅ Déjà prêt |

---

## 🚀 IMPLÉMENTATION RECOMMANDÉE

### **Hook `useGPSWeb.js`** (nouveau) :

```javascript
import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

export function useGPSWeb({ enabled, livreurId }) {
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled || !livreurId) return;

    // GPS continu (écran allumé uniquement)
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        await base44.entities.Livreur.update(livreurId, {
          latitude,
          longitude,
          derniere_position_date: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        });
      },
      (error) => console.error("[GPS Web] Erreur:", error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled, livreurId]);
}
```

---

### **Heartbeat background** (déjà existant) :

```javascript
// hooks/useHeartbeat.js (DÉJÀ UTILISÉ)
// Sync toutes les 30s quand app est visible
// + Geolocation API quand écran allumé
```

---

## 💡 WORKAROUNDS

### **1. Garder écran allumé pendant les courses**

```javascript
// Utiliser Wake Lock API
useEffect(() => {
  let wakeLock = null;

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  };

  if (courseEnCours) {
    requestWakeLock();
  }

  return () => wakeLock?.release();
}, [courseEnCours]);
```

**Avantage** : Écran reste allumé → GPS continue

---

### **2. Notification "GPS actif"**

```javascript
// Utiliser Notification API (déjà dans APK)
new Notification("SILGAPP - GPS actif", {
  body: "Suivi de position en cours...",
  icon: "/favicon.ico",
  tag: "gps-tracking",
});
```

---

### **3. Optimiser fréquence GPS**

```javascript
// Adapter fréquence selon statut
const frequency = statut === "en_course" ? 10000 : 30000;
// 10s pendant course, 30s sinon
```

---

## ✅ CHECKLIST

- [x] Utiliser `navigator.geolocation.watchPosition()`
- [x] Heartbeat toutes les 30s (déjà existant)
- [ ] Ajouter Wake Lock API pendant courses
- [ ] Tester APK Base44
- [ ] Vérifier fréquence GPS réelle
- [ ] Mesurer autonomie batterie

---

## 🎯 RÉSULTAT ATTENDU

**Avec APK Base44** :
- ✅ GPS fonctionne écran allumé
- ✅ Heartbeat 30s (background limité)
- ⚠️ GPS suspendu écran verrouillé
- ⚠️ Livreur peut devenir "noir" après 10 min

**Recommandation** :
- Demander aux livreurs de **garder l'écran allumé** pendant les courses
- Ou utiliser **support téléphone** + écran toujours ON
- Alternative : **Tablette** branchée dans véhicule

---

## 📞 PROCHAINE ÉTAPE

Si besoin de GPS background **réel** (style Uber) :
1. Contacter support Base44 pour APK custom
2. Ou développer app native séparée (React Native / Flutter)
3. Alternative : Utiliser app web avec écran toujours allumé

---

**Solution optimisée pour APK Base44 standard** ✅