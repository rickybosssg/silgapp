# 🔍 DIAGNOSTIC COMPLET - DISPATCH EXTERNE

## 📊 Flux Complet à Vérifier

```
Client crée course → Base de données → dispatchExterneAuto → Trouve livreurs → 
→ Assigne livreur → Notification push → Query livreur → Modal → Acceptation
```

---

## ✅ ÉTAPE 1 : Création de la course

**Fichier** : `pages/CourseExterneFormSync.jsx`

### Vérifications :

1. **Statut créé** : Ligne 213 → `statut: "recherche_livreur"` ✅ CORRECT
2. **GPS** : Lignes 207-210 → `gps_depart_lat`, `gps_depart_lng` (peuvent être null si GPS non activé)
3. **Dispatch automatique** : Ligne 136 → `dispatchExterneAuto` est appelé

**Problème potentiel** : 
- ❓ Le GPS client est-il obligatoire ? 
- ❓ Si `gps_depart_lat` = null, la recherche de livreurs échouera

**Logs à ajouter** :
```javascript
console.log('[CLIENT] Course créée:', {
  course_id: response.id,
  statut: response.statut,
  gps_depart: { lat: response.gps_depart_lat, lng: response.gps_depart_lng },
  adresse_depart: response.adresse_depart
});
```

---

## ✅ ÉTAPE 2 : Déclenchement dispatchExterneAuto

**Fichier** : `pages/CourseExterneFormSync.jsx` ligne 136

```javascript
await base44.functions.invoke("dispatchExterneAuto", {
  action: "lancer_recherche_auto",
  course_id: course.id
});
```

### Vérifications :

1. ✅ Appel fonction backend présent
2. ✅ Action correcte : `lancer_recherche_auto`
3. ✅ course_id passé correctement

**Logs à vérifier dans backend** :
```javascript
console.log(`[DISPATCH] Démarrage dispatch pour course ${course_id}`);
```

**Problèmes potentiels** :
- ❌ Erreur silencieuse dans try/catch
- ❌ Course introuvable (race condition)
- ❌ Statut déjà modifié

---

## ✅ ÉTAPE 3 : Géolocalisation client

**Fichier** : `pages/CourseExterneFormSync.jsx` lignes 207-210

### Conditions requises :

- ✅ `gps_depart_lat` : nombre ou null
- ✅ `gps_depart_lng` : nombre ou null
- ❓ **GPS activé par le client ?** → À vérifier dans le formulaire

**Problème CRITIQUE** :
Si `gps_depart_lat` ou `gps_depart_lng` = null → **La recherche de livreurs échouera**

Dans `dispatchExterneAuto.js` ligne 41-44 :
```javascript
const dist = calculerDistance(
  course.gps_depart_lat, course.gps_depart_lng,  // ← PEUT ÊTRE NULL !
  l.latitude, l.longitude
);
```

**Solution** : Rendre le GPS obligatoire pour le client OU utiliser une adresse par défaut

---

## ✅ ÉTAPE 4 : Recherche des livreurs externes

**Fichier** : `functions/dispatchExterneAuto.js` lignes 22-59

### Conditions de recherche :

```javascript
{
  type_livreur: 'externe',      // ✅ Livreur externe
  validation: 'valide',          // ✅ Compte validé
  actif: true,                   // ✅ Compte actif
  statut: 'disponible',          // ✅ Disponible (pas hors_ligne)
  app_active: true,              // ✅ Application ouverte
}
```

### Filtre GPS (lignes 35-38) :

```javascript
const livreursGPS = livreurs.filter(l =>
  l.latitude && l.longitude && l.derniere_position_date &&
  new Date(l.derniere_position_date).getTime() > Date.now() - 300000  // 5 min
);
```

**Problèmes potentiels** :

1. ❌ **Livreur hors_ligne** → exclus
2. ❌ **GPS inactif** → exclus
3. ❌ **Position > 5 min** → exclus
4. ❌ **Validation ≠ 'valide'** → exclus
5. ❌ **actif = false** → exclus

**Logs à ajouter** :
```javascript
console.log('[DISPATCH] Livreurs trouvés:', livreurs.length);
console.log('[DISPATCH] Livreurs avec GPS:', livreursGPS.length);
console.log('[DISPATCH] Livreurs proches:', livreursProches.length);
```

---

## ✅ ÉTAPE 5 : Calcul distance GPS

**Fichier** : `functions/dispatchExterneAuto.js` lignes 6-17

### Formule Haversine :

```javascript
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon terre en KM ✅
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  // ...
  return R * c; // Retourne KM ✅
}
```

**Vérifications** :

- ✅ Unité : Kilomètres
- ✅ Rayon progressif : 3km → 5km → 8km
- ✅ Tri par distance croissante

**Problèmes potentiels** :

- ❌ lat/lng inversées ? → Non, ordre correct
- ❌ Rayon trop petit ? → 8km max semble correct
- ❌ **GPS client null** → distance = NaN → filtre échoue

---

## ✅ ÉTAPE 6 : Insertion dans coursesDisponibles

**Fichier** : `functions/dispatchExterneAuto.js` lignes 108-122

### Mise à jour course :

```javascript
const courseUpdate = {
  livreur_id: livreurProche.id,           // ✅ ID livreur
  livreur_nom: ...,                        // ✅ Nom livreur
  statut: 'recherche_livreur',             // ✅ Reste en recherche
  dispatch_status: 'propose',              // ✅ Statut dispatch
  heure_sollicitation: ...,                // ✅ Timestamp
  timeout_expires_at: ...,                 // ✅ Expiration 60s
};
```

**Logs à ajouter** :
```javascript
console.log('[DISPATCH] Course mise à jour:', {
  course_id: course_id,
  livreur_id: livreurProche.id,
  dispatch_status: 'propose',
  timeout: courseUpdate.timeout_expires_at
});
```

---

## ✅ ÉTAPE 7 : Affichage côté livreur

**Fichier** : `pages/LivreurExterneApp.jsx` lignes 86-101

### Query temps réel :

```javascript
const { data: coursesDisponibles = [] } = useQuery({
  queryKey: ["courses-externes-disponibles", livreurProfil?.id, ...],
  queryFn: async () => {
    const courses = await base44.entities.CourseExterne.filter({
      livreur_id: livreurProfil.id,        // ✅ Filtré par livreur
      dispatch_status: "propose"           // ✅ Seulement propositions
    }, "-created_date", 20);
    return courses || [];
  },
  enabled: !!livreurProfil?.id && livreurProfil.statut === "disponible" && gpsActif,
  refetchInterval: 2000,  // ✅ Polling 2s
});
```

**Conditions d'activation** :

1. ✅ `livreurProfil.id` existe
2. ✅ `livreurProfil.statut === "disponible"`
3. ✅ `gpsActif === true`

**Problèmes potentiels** :

- ❌ **Livreur statut ≠ "disponible"** → query désactivée
- ❌ **GPS inactif** → query désactivée
- ❌ **Cache React** → données obsolètes
- ❌ **Polling trop lent** → 2s peut manquer des courses éphémères

**Logs à ajouter** :
```javascript
console.log('[LIVREUR] Query coursesDisponibles:', {
  enabled: !!livreurProfil?.id && livreurProfil.statut === "disponible" && gpsActif,
  livreur_id: livreurProfil?.id,
  statut: livreurProfil?.statut,
  gpsActif: gpsActif,
  courses_trouvees: coursesDisponibles?.length
});
```

---

## ✅ ÉTAPE 8 : Popup CourseEnAttenteModal

**Fichier** : `pages/LivreurExterneApp.jsx` lignes 335-345

### Condition d'ouverture :

```javascript
{courseEnAttente && (
  <CourseEnAttenteModal
    course={courseEnAttente}
    livreurId={livreurProfil.id}
    ...
  />
)}
```

**Définition** (ligne 103-105) :
```javascript
const courseEnAttente = useMemo(() => {
  return coursesDisponibles[0] || null;
}, [coursesDisponibles]);
```

**Problèmes potentiels** :

- ❌ **courseEnAttente = null** → modal ne s'ouvre pas
- ❌ **Z-index** → modal cachée par d'autres éléments
- ❌ **Render conditionnel** → React ne render pas

**Logs à ajouter** :
```javascript
console.log('[LIVREUR] courseEnAttente:', {
  exists: !!courseEnAttente,
  course_id: courseEnAttente?.id,
  dispatch_status: courseEnAttente?.dispatch_status
});
```

---

## ✅ ÉTAPE 9 : Notifications push

**Fichier** : `functions/dispatchExterneAuto.js` lignes 124-136

### Envoi notification :

```javascript
await base44.functions.invoke('envoiNotificationPush', {
  email: livreurProche.user_email,
  titre: '🚨 Nouvelle course disponible !',
  message: `Course à ${distance.toFixed(1)}km - ...`,
  type: 'nouvelle_course',
  course_id: course_id,
});
```

**Problèmes potentiels** :

- ❌ **Token FCM expiré** → notification échoue
- ❌ **Fonction envoiNotificationPush** → existe-t-elle ?
- ❌ **user_email** → null ou incorrect
- ❌ **Permissions push** → non autorisées sur device

**Logs à vérifier** :
```javascript
// Dans envoiNotificationPush
console.log('[PUSH] Envoi notification à:', email);
```

---

## ✅ ÉTAPE 10 : Race conditions

**Problème majeur** :

Dans `dispatchExterneAuto.js` ligne 158-168 :

```javascript
// Vérifier que la course n'est pas déjà prise
if (course.livreur_id && course.livreur_id !== livreur_id) {
  return Response.json({ 
    success: false, 
    error: 'Course déjà prise par un autre livreur',
    already_taken: true 
  });
}
```

**Scénario race condition** :

1. Livreur A accepte à T0
2. Livreur B accepte à T0+50ms
3. Les deux vérifications passent AVANT la mise à jour
4. **Les deux livreurs acceptent la même course**

**Solution** : Utiliser une transaction atomique ou un verrou

---

## 🔴 PROBLÈMES IDENTIFIÉS

### 1. **GPS Client Obligatoire ?**

**Problème** : Si le client n'active pas son GPS, `gps_depart_lat` = null → recherche livreurs échoue

**Vérification** :
- Ligne 207-210 dans `CourseExterneFormSync.jsx`
- Le GPS est-il obligatoire avant soumission ?

**Solution** : Rendre le GPS obligatoire OU utiliser géocodage adresse

---

### 2. **Query Livreur Désactivée**

**Problème** : Query `coursesDisponibles` désactivée si :
- `livreurProfil.statut !== "disponible"`
- `gpsActif === false`

**Vérification** :
- Le livreur est-il bien en statut "disponible" ?
- Le GPS est-il bien activé ?

**Logs à ajouter** :
```javascript
useEffect(() => {
  console.log('[LIVREUR] État query:', {
    enabled: !!livreurProfil?.id && livreurProfil.statut === "disponible" && gpsActif,
    statut: livreurProfil?.statut,
    gpsActif: gpsActif
  });
}, [livreurProfil?.statut, gpsActif]);
```

---

### 3. **Polling Trop Lent**

**Problème** : Polling 2s peut manquer des courses éphémères

**Solution** : Réduire à 1s ou utiliser subscriptions temps réel

---

### 4. **Notifications Push**

**Problème** : Si notification échoue, livreur ne sait pas qu'il a une course

**Vérification** :
- Fonction `envoiNotificationPush` existe-t-elle ?
- Token FCM valide ?
- Permissions push autorisées ?

---

## 📋 CHECKLIST DE TEST

### Côté Client :

- [ ] Client crée une course
- [ ] GPS client activé (lat/lng non null)
- [ ] Statut course = "recherche_livreur"
- [ ] Dispatch automatique déclenché
- [ ] Logs backend visibles

### Côté Livreur :

- [ ] Livreur externe connecté
- [ ] Statut = "disponible"
- [ ] GPS activé
- [ ] App ouverte (app_active = true)
- [ ] Query `coursesDisponibles` enabled
- [ ] Course apparaît dans coursesDisponibles
- [ ] Modal CourseEnAttenteModal s'ouvre
- [ ] Notification push reçue
- [ ] Vibration activée
- [ ] Son joué

### Côté Backend :

- [ ] Fonction dispatchExterneAuto appelée
- [ ] Logs "[DISPATCH] Démarrage dispatch"
- [ ] Livreurs trouvés (> 0)
- [ ] Distance calculée correctement
- [ ] Course mise à jour avec livreur_id
- [ ] Notification push envoyée

---

## 🛠️ ACTIONS CORRECTIVES

### 1. Ajouter logs détaillés

**Fichier** : `functions/dispatchExterneAuto.js`

```javascript
// Ligne 69
console.log(`[DISPATCH] Démarrage dispatch pour course ${course_id}`);
console.log('[DISPATCH] Course data:', {
  id: course.id,
  statut: course.statut,
  gps_depart: { lat: course.gps_depart_lat, lng: course.gps_depart_lng },
  adresse_depart: course.adresse_depart
});

// Ligne 31
console.log('[DISPATCH] Aucun livreur trouvé en base');

// Ligne 38
console.log('[DISPATCH] Livreurs avec GPS valide:', livreursGPS.length);

// Ligne 46
console.log('[DISPATCH] Livreurs proches:', livreursProches.length);

// Ligne 88
console.log(`[DISPATCH] ${livreursTries.length} livreurs trouvés dans rayon ${rayon}km`);

// Ligne 93
console.warn('[DISPATCH] Aucun livreur trouvé après 3km, 5km, 8km');

// Ligne 108
console.log(`[DISPATCH] Assignment au livreur ${livreurProche.id} (${livreurProche.nom}) à ${distance.toFixed(1)}km`);

// Ligne 123
console.log('[DISPATCH] Course mise à jour:', courseUpdate);

// Ligne 138
console.log('[DISPATCH] Notification push envoyée');
```

### 2. Ajouter logs côté livreur

**Fichier** : `pages/LivreurExterneApp.jsx`

```javascript
// Après ligne 101
useEffect(() => {
  console.log('[LIVREUR] coursesDisponibles updated:', {
    count: coursesDisponibles?.length,
    first_course: coursesDisponibles?.[0]?.id,
    livreur_id: livreurProfil?.id,
    statut: livreurProfil?.statut,
    gpsActif: gpsActif
  });
}, [coursesDisponibles, livreurProfil]);

// Après ligne 105
useEffect(() => {
  console.log('[LIVREUR] courseEnAttente:', {
    exists: !!courseEnAttente,
    course_id: courseEnAttente?.id,
    dispatch_status: courseEnAttente?.dispatch_status
  });
}, [courseEnAttente]);
```

### 3. Vérifier GPS client obligatoire

**Fichier** : `pages/CourseExterneFormSync.jsx`

Ajouter validation avant submit :

```javascript
if (!formData.gps_depart_lat || !formData.gps_depart_lng) {
  toast.error("GPS de récupération requis");
  return;
}
```

---

## 🎯 CONCLUSION

**Problèmes les plus probables** :

1. **GPS client non activé** → course créée sans GPS → recherche échoue
2. **Livreur statut ≠ "disponible"** → query désactivée
3. **Livreur GPS inactif** → query désactivée OU exclu de la recherche
4. **Notification push échoue** → livreur pas notifié
5. **Polling 2s trop lent** → course expire avant d'être vue

**Prochaines étapes** :

1. ✅ Ajouter tous les logs
2. ✅ Tester avec GPS client activé
3. ✅ Vérifier statut livreur
4. ✅ Vérifier GPS livreur
5. ✅ Consulter logs backend après création course

---

**Date** : 2025-05-25
**Statut** : Diagnostic complet effectué, reste à ajouter logs et tester