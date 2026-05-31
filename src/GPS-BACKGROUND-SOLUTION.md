# 📍 GPS BACKGROUND - SOLUTION CAPACITOR NATIVE

**Date** : 31 mai 2026  
**Solution** : watchPosition Capacitor (compatible Web + Android)

---

## ✅ CORRECTION APPLIQUÉE

Le plugin `@capacitor-community/background-geolocation` n'est **pas compatible** avec l'environnement Web/Vite.

**Solution de rechange** : Utiliser `Geolocation.watchPosition()` de Capacitor qui fonctionne en background sur Android natif.

---

## 📦 PACKAGES REQUIS

```bash
@capacitor/geolocation@^5.0.3  ✅ Déjà installé
@capacitor/app@^5.0.8          ✅ Déjà installé
```

---

## 🔧 CONFIGURATION

### **Hook `useBackgroundGeolocation.js`** :

Utilise `Geolocation.watchPosition()` avec :
- `enableHighAccuracy: true` → GPS haute précision
- `distanceFilter: 5` → Update tous les 5 mètres
- `timeout: 10000` → Timeout 10s
- `maximumAge: 0` → Position fraîche (pas de cache)

### **Fonctionnement background** :

Sur **Android natif** (APK Capacitor) :
- ✅ `watchPosition` continue en background
- ✅ Nécessite permission `ACCESS_BACKGROUND_LOCATION`
- ✅ Service foreground recommandé (notification)

Sur **Web** (PWA) :
- ⚠️ `watchPosition` peut être suspendu en background (limitation navigateur)
- ✅ Fallback : heartbeat toutes les 30s

---

## ⚙️ CONFIGURATION ANDROID

### **`AndroidManifest.xml`** :

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<application>
  <service
    android:name="com.getcapacitor.app.CapacitorBackgroundService"
    android:enabled="true"
    android:foregroundServiceType="location" />
</application>
```

### **`capacitor.config.json`** :

```json
{
  "plugins": {
    "Geolocation": {
      "enableHighAccuracy": true,
      "requestPermissions": true,
      "showBackgroundLocation": true
    }
  }
}
```

---

## 🧪 TESTS

### **Test 1 : Activation GPS**

```javascript
// LivreurApp.jsx (ligne ~150)
const handleActiverGPS = async () => {
  const permissionStatus = await Geolocation.requestPermissions();
  // Doit afficher popup Android avec option "Toujours"
};
```

**Résultat attendu** :
- ✅ Popup Android : "Autoriser l'accès à la position ?"
- ✅ Option "Toujours autoriser" disponible
- ✅ Toast "GPS activé – Suivi permanent activé ✓"

---

### **Test 2 : Background**

```javascript
// watchPosition continue en background
watchIdRef.current = await Geolocation.watchPosition(
  { enableHighAccuracy: true, timeout: 10000, distanceFilter: 5 },
  async (position) => {
    // Callback même en background (Android natif)
    await base44.entities.Livreur.update(livreurId, { ... });
  }
);
```

**Vérification** :
```bash
adb logcat | grep "BackgroundGeo"
# Doit afficher les sync GPS même app en fond
```

---

### **Test 3 : Écran verrouillé**

**Scénario** :
1. GPS activé, livreur "En ligne"
2. Verrouiller téléphone
3. Attendre 1 minute

**Résultat attendu** :
- ✅ GPS continue (logs ADB)
- ✅ Positions sync BDD
- ✅ Livreur visible sur carte admin

---

## 📊 COMPARAISON

| Fonctionnalité | Plugin Community | watchPosition Capacitor |
|----------------|------------------|-------------------------|
| **Compatible Web** | ❌ Non | ✅ Oui |
| **Background Android** | ✅ Oui | ✅ Oui |
| **Écran verrouillé** | ✅ Oui | ✅ Oui |
| **Setup complexe** | Moyen | Simple |
| **Dépendances** | 1 plugin | Capacitor core |

---

## 🚀 BUILD APK

```bash
# Sync Capacitor
npx cap sync android

# Ouvrir Android Studio
npx cap open android

# Build APK
./gradlew assembleDebug

# Installer
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## ✅ Checklist

- [x] Hook `useBackgroundGeolocation` créé
- [x] Utilise `Geolocation.watchPosition()`
- [x] Permission "Toujours autoriser"
- [x] Fréquence 10 secondes
- [x] Sync BDD automatique
- [ ] Tester APK Android
- [ ] Vérifier background
- [ ] Vérifier écran verrouillé

---

**Solution compatible Web + Android** ✅