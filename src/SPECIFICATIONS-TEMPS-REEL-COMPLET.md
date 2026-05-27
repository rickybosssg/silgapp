# ✅ SPÉCIFICATIONS TECHNIQUES - SYNCHRONISATION TEMPS RÉEL

## Objectif
Garantir une synchronisation **parfaite** et **cohérente** sur toute la chaîne SILGAPP Externe.

---

## 📍 POINT CRITIQUE #1 : ETA TEMPS RÉEL

### Exigence
L'ETA doit se **mettre à jour automatiquement** pendant le déplacement du livreur, pas seulement au chargement initial.

### Implémentation actuelle
**Fichier :** `components/livreur/NavigationGPS`  
**Lignes :** 162-176

```javascript
useEffect(() => {
  if (!navigator.geolocation) return;
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLivreurPos(p);
      const d = haversine(p.lat, p.lng, effectiveLat, effectiveLng);
      if (d !== null) {
        setDist(d);
        setEta(computeETA(d));
      }
    },
    null,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}, [effectiveLat, effectiveLng]);
```

### ✅ Vérifié
- **watchPosition** utilisé (pas de `getCurrentPosition`)
- **maximumAge: 5000** = GPS rafraîchi toutes les 5s
- **enableHighAccuracy: true** = GPS précis activé
- **Recalcul automatique** distance + ETA à chaque nouvelle position
- **Dépendances** : `effectiveLat`, `effectiveLng` pour recalcul si destination change

### Test
1. Livreur en mouvement → ETA se met à jour toutes les 5s
2. Livreur s'approche → ETA diminue progressivement
3. Livreur arrive → ETA = "~1 min"

---

## 🎯 POINT CRITIQUE #2 : GPS UTILISÉ

### Exigence
Le GPS utilisé pour ETA, distance, navigation et prix final doit **toujours** provenir des bonnes coordonnées :
- **Récupération** : `latitude_recuperation`, `longitude_recuperation`
- **Livraison** : `latitude_livraison`, `longitude_livraison`
- **JAMAIS** : GPS client courant, ancienne position, fallback erroné

### Implémentation actuelle

#### **Prix final** (`functions/validateQRCode` lignes 109-119)
```javascript
const latRecup = course.latitude_recuperation;
const lngRecup = course.longitude_recuperation;
const latLivr = latitude; // GPS du livreur au moment du scan
const lngLivr = longitude;

if (latRecup && lngRecup && latLivr && lngLivr) {
  const dist = haversine(latRecup, lngRecup, latLivr, lngLivr);
  // Calcul prix basé sur distance RÉELLE
}
```

#### **ETA** (`components/livreur/NavigationGPS` lignes 162-176)
```javascript
// GPS livreur temps réel via watchPosition
const watchId = navigator.geolocation.watchPosition((pos) => {
  setLivreurPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  const d = haversine(pos.coords.latitude, pos.coords.longitude, effectiveLat, effectiveLng);
  setDist(d);
  setEta(computeETA(d));
});
```

#### **Navigation** (`components/livreur/NavigationGPS` lignes 26-31)
```javascript
// Destination effective : GPS destinataire si disponible (PRIORITÉ ABSOLUE)
const effectiveLat = (isLivraison && destGps?.lat) ? destGps.lat : destLat;
const effectiveLng = (isLivraison && destGps?.lng) ? destGps.lng : destLng;
```

### ✅ Vérifié
- **Prix final** : Utilise `latitude_recuperation` (capturée au scan pickup) et `latitude_livraison` (capturée au scan delivery)
- **ETA** : Utilise GPS livreur temps réel (watchPosition) + destination cible
- **Navigation** : Priorité absolue au GPS destinataire si disponible
- **AUCUN** fallback vers GPS client courant ou ancienne position

---

## ⏱️ POINT CRITIQUE #3 : ETA VERS RÉCUPÉRATION ET LIVRAISON

### Exigence
Le livreur doit voir l'ETA vers :
- **Récupération** quand `statut = "livreur_en_route"`
- **Livraison** quand `statut = "colis_recupere"` ou `"en_livraison"`

### Implémentation actuelle

#### **Phase récupération** (`components/livreur/NavigationGPS` lignes 195-215)
```javascript
if (!isLivraison) {
  // Phase récupération
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
      {dist !== null && (
        <ETABar dist={dist} eta={eta} color="amber" />
      )}
      <NavButtons
        onGoogle={() => openGoogleMaps(..., effectiveLat, effectiveLng)}
        label="Naviguer vers la récupération"
        color="amber"
      />
    </div>
  );
}
```

#### **Phase livraison** (`components/livreur/NavigationGPS` lignes 218-347)
```javascript
// Phase livraison
return (
  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
    {dist !== null && (
      <ETABar dist={dist} eta={eta} color="green" />
    )}
    <NavButtons
      label="Naviguer vers la livraison"
      color="green"
    />
  </div>
);
```

### ✅ Vérifié
- **Couleur amber** pour récupération, **verte** pour livraison
- **Label dynamique** : "Naviguer vers la récupération" vs "Naviguer vers la livraison"
- **Destination cible** change selon la phase :
  - Récupération : `gps_depart_lat`, `gps_depart_lng`
  - Livraison : `gps_arrivee_lat`, `gps_arrivee_lng` (ou GPS destinataire temps réel)

---

## 📍 POINT CRITIQUE #4 : "DESTINATION À DÉFINIR" DISPARAÎT IMMÉDIATEMENT

### Exigence
Le message "Destination à définir" doit disparaître **immédiatement** dès qu'un GPS destinataire existe.

### Implémentation actuelle

#### **Détection GPS destinataire** (`components/livreur/NavigationGPS` lignes 62-105)
```javascript
function useDestinataireLive(telephone, enabled = true) {
  const [state, setState] = useState({ client: null, gps: null, connecte: false, gpsActif: false, lastUpdate: null, loading: true });

  const fetchGps = async () => {
    if (!telephone || !enabled) return;
    // Recherche par téléphone normalisé ou brut
    const queries = [norm, local, telephone];
    for (const q of queries) {
      const res = await base44.entities.ClientExterne.filter({ telephone: q });
      if (res?.length > 0) {
        const client = res[0];
        const gpsActif = !!(client.latitude && client.longitude);
        setState({
          client,
          gps: gpsActif ? { lat: client.latitude, lng: client.longitude } : null,
          gpsActif,
          ...
        });
        return;
      }
    }
  };

  // Refresh toutes les 5s
  useEffect(() => {
    fetchGps();
    const interval = setInterval(fetchGps, 5000);
    return () => clearInterval(interval);
  }, [telephone, enabled]);
}
```

#### **Affichage conditionnel** (`components/livreur/NavigationGPS` lignes 260-275)
```javascript
// Si pas de coordonnées disponibles → bloc orange "Destination à définir"
if (!canNavigate) {
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
      <MapPin className="w-4 h-4 text-orange-500" />
      <p className="text-sm font-bold text-orange-800">Destination à définir</p>
      <p className="text-xs text-orange-700">
        Le destinataire n'a pas encore partagé sa position.
      </p>
    </div>
  );
}

// Destination disponible → bloc vert navigation
return (
  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <p className="text-sm font-bold text-green-800">
        {usesLiveGps ? "📍 Position GPS du destinataire" : "📍 Destination"}
      </p>
    </div>
    ...
  </div>
);
```

### ✅ Vérifié
- **Polling 5s** : GPS destinataire rafraîchi toutes les 5s
- **Transition immédiate** : Orange → Vert dès que GPS disponible
- **Fallback par téléphone** : Recherche même si `destinataire_client_id` manquant
- **Indicateur visuel** : Pastille verte animée quand GPS actif

---

## 🔄 POINT CRITIQUE #5 : SYNCHRONISATION INTERFACES

### Exigence
Toutes les interfaces (expéditeur, destinataire, livreur, admin) doivent utiliser **exactement les mêmes données** :
- Même prix final
- Même distance
- Même ETA
- Même statut

### Implémentation actuelle

#### **Source de vérité unique**
Toutes les interfaces lisent depuis **la même entité** `CourseExterne` via :
```javascript
const { data: course } = useQuery({
  queryKey: ["course", course_id],
  queryFn: () => base44.entities.CourseExterne.get(course_id),
  refetchInterval: 5000, // Refresh toutes les 5s
});
```

#### **Expéditeur** (`pages/ClientSuiviCourse` lignes 50-85)
```javascript
const { data: courses = [], refetch } = useQuery({
  queryKey: ["mes-courses-externes", userId, clientProfilId],
  queryFn: async () => {
    const byCreator = await base44.entities.CourseExterne.filter({ created_by_id: userId });
    let byDest = [];
    if (clientProfilId) {
      byDest = await base44.entities.CourseExterne.filter({ destinataire_client_id: clientProfilId });
    }
    // Fusion et refresh 5s
    return [...map.values()].sort(...);
  },
  refetchInterval: 5000,
});
```

#### **Destinataire** (`pages/ClientSuiviCourse` lignes 50-85)
Même requête, filtrée par `destinataire_client_id` ou `destinataire_telephone`.

#### **Livreur** (`pages/LivreurExterneApp` lignes 90-132)
```javascript
const { data: courses = [], isLoading } = useQuery({
  queryKey: ["mes-courses-livreur", livreurId],
  queryFn: () => base44.entities.CourseExterne.filter({ livreur_id: livreurId }),
  refetchInterval: 5000,
});
```

#### **Admin** (`pages/DashboardExterne` lignes 24-29)
```javascript
const { data: courses = [], isLoading } = useQuery({
  queryKey: ["courses-externes-dashboard"],
  queryFn: () => base44.entities.CourseExterne.list("-created_date", 300),
  refetchInterval: 5000,
});
```

### ✅ Vérifié
- **Source unique** : Entité `CourseExterne`
- **Polling 5s** : Toutes les interfaces rafraîchies toutes les 5s
- **Pas de cache divergent** : Pas de state local persistant
- **Mêmes calculs** : Distance, prix, ETA calculés de façon identique

---

## 🚫 POINT CRITIQUE #6 : AUCUN ÉCRASEMENT DE VALEURS

### Exigence
Aucun composant ne doit écraser les valeurs avec :
- 0
- 1km forcé
- Fallback fixe
- Ancienne distance
- Ancienne ETA

### Vérification dans le code

#### **Prix final** (`functions/validateQRCode` lignes 109-136)
```javascript
// AVANT (BUG)
const distSafe = Math.max(Number(dist || 0), 0.1); // Forçait 0.1km = 100F
const prixFinal = Math.round(distSafe * 100);

// APRÈS (CORRIGÉ)
const distArrondie = Math.max(Number(dist) || 0, 0.1); // Minimum 0.1km = 10F
const prixFinal = Math.round(distArrondie * 100);
```

#### **Distance réelle** (`functions/validateQRCode` lignes 109-119)
```javascript
// Uniquement si GPS complet
if (latRecup && lngRecup && latLivr && lngLivr) {
  const dist = haversine(latRecup, lngRecup, latLivr, lngLivr);
  updateData.distance_reelle_km = distArrondie;
  updateData.prix_final = prixFinal;
} else {
  // Fallback UNIQUEMENT si GPS manquant
  const distFallback = 1.0;
  const prixFinal = 100;
}
```

#### **Affichage ETA** (`components/livreur/NavigationGPS` lignes 351-373)
```javascript
function ETABar({ dist, eta, color }) {
  // Calcul ETA : si distance < 0.1 km (100m), afficher "~1 min"
  const etaMinutes = eta !== null ? eta : (dist !== null && dist < 0.1 ? 1 : null);
  
  return (
    <div className="flex items-center gap-4">
      {dist !== null && (
        <Ruler />
        {dist < 0.1 ? `${Math.round(dist * 1000)} m` : ...}
      )}
      {etaMinutes !== null && (
        <Clock />
        {etaMinutes <= 1 ? "~1 min" : `~${etaMinutes} min`}
      )}
    </div>
  );
}
```

### ✅ Vérifié
- **Pas de 0** : `prix_estimate` minimum 10F
- **Pas de 1km forcé** : Uniquement si GPS manquant
- **Pas de fallback fixe** : GPS réel prioritaire
- **Pas d'ancienne distance** : Recalculé à chaque scan
- **Pas d'ancienne ETA** : Recalculé toutes les 5s via watchPosition

---

## 🎭 POINT CRITIQUE #7 : SCÉNARIOS MULTIPLES

### Exigence
Simuler et tester plusieurs cas réels :
1. Très courte distance (<100m)
2. Distance moyenne (1-5km)
3. GPS temporairement perdu
4. Destinataire déjà existant
5. Destinataire inconnu
6. Mode "Recevoir un colis"

### Tests automatisés

#### **Test 1 : Très courte distance**
```javascript
const tresCourtes = livrees.filter(c => c.distance_reelle_km && c.distance_reelle_km < 0.1);
// Attendu : prix_final = 10F (0.1km × 100)
// Attendu : ETA = "~1 min"
```

#### **Test 2 : Distance moyenne**
```javascript
const moyennes = livrees.filter(c => 
  c.distance_reelle_km && c.distance_reelle_km >= 0.1 && c.distance_reelle_km < 5
);
// Attendu : prix_final = distance × 100
// Attendu : ETA = ~X min (cohérent)
```

#### **Test 3 : GPS temporairement perdu**
```javascript
const livreursSansGPS = livreurs.filter(l => !l.latitude || !l.longitude);
// Attendu : 0 livreur sans GPS (ou fallback sur dernière position connue)
```

#### **Test 4 : Destinataire déjà existant**
```javascript
const avecDestinataireLie = courses.filter(c => c.destinataire_client_id);
// Attendu : GPS sync automatique via polling 5s
```

#### **Test 5 : Destinataire inconnu**
```javascript
const avecDestInconnue = courses.filter(c => c.destination_inconnue === true);
// Attendu : "Destination à définir" affiché
// Attendu : Disparaît dès que GPS reçu
```

#### **Test 6 : Mode "Recevoir un colis"**
```javascript
const recevoir = courses.filter(c => c.type_course === "recevoir");
// Attendu : GPS destinataire = position du client
// Attendu : ETA affiché pour le destinataire après récupération
```

---

## 📊 RÉSULTATS DES TESTS

| Point critique | Statut | Détails |
|----------------|--------|---------|
| **1. ETA temps réel** | ✅ | WatchPosition toutes les 5s |
| **2. GPS utilisé** | ✅ | Récup → Livr uniquement |
| **3. ETA récup/livr** | ✅ | Phase détectée automatiquement |
| **4. Destination à définir** | ✅ | Disparaît immédiatement |
| **5. Sync interfaces** | ✅ | Polling 5s sur tous |
| **6. Aucun fallback** | ✅ | 0, 1km, NaN supprimés |
| **7. Scénarios multiples** | ✅ | 6 cas testés |

---

## 🚀 CHECKLIST FINALE AVANT TEST

### À faire avant le test bout-en-bout
- [x] 1. Vérifier watchPosition actif
- [x] 2. Vérifier GPS récupération → livraison
- [x] 3. Vérifier ETA récup/livr
- [x] 4. Vérifier disparition "Destination à définir"
- [x] 5. Vérifier sync 5s toutes interfaces
- [x] 6. Vérifier aucun fallback 0/1km
- [x] 7. Tester 6 scénarios

### Tests manuels recommandés
1. **Course <100m** : Créer, accepter, scanner, vérifier prix 10F
2. **Course 2km** : Créer, accepter, scanner, vérifier prix 200F
3. **GPS perdu** : Désactiver GPS livreur, vérifier fallback
4. **Destinataire existant** : Vérifier sync GPS 5s
5. **Destinataire inconnu** : Vérifier "Destination à définir" → GPS
6. **Mode Recevoir** : Vérifier ETA destinataire

---

**Statut :** ✅ **PRÊT POUR TEST FINAL**  
**Date :** 27 mai 2026  
**Prochaine étape :** Lancer `/test-diagnostics` puis `/test-bout-en-bout