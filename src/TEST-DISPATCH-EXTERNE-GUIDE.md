# 🧪 GUIDE DE TEST - DISPATCH EXTERNE

## 📋 Préparation

### 1. Créer un compte livreur externe de test

```bash
# Dans le dashboard admin
- Créer livreur externe
- type_livreur: "externe"
- validation: "valide"
- actif: true
- statut: "disponible"
- user_email: "livreur.test@silgapp2.local"
```

### 2. Installer APK livreur externe

```bash
adb uninstall com.silgapp2.app
adb install dist/android/app/build/outputs/apk/release/app-release.apk
```

### 3. Activer logs console

Sur device Android :
- Chrome → `chrome://inspect`
- Ouvrir console
- Filtrer par "[DISPATCH]" ou "[LIVREUR]"

---

## 🎯 Test Complet Étape par Étape

### ÉTAPE 1 : Connexion livreur

**Actions** :
1. Ouvrir app livreur
2. Se connecter avec compte livreur externe
3. Activer GPS (obligatoire)
4. Mettre statut "disponible"

**Logs attendus** :
```
[LIVREUR] 📊 État query coursesDisponibles: {
  enabled: true,
  livreur_id: "abc123",
  statut: "disponible",
  gpsActif: true
}
```

**✅ Vérifier** :
- [ ] GPS activé (icône 📍 verte)
- [ ] Statut = "Disponible" (card verte)
- [ ] `app_active = true` (vérifier en base)

---

### ÉTAPE 2 : Création course client

**Actions** :
1. Ouvir app client (autre device/browser)
2. Créer nouvelle course "expédier"
3. **ACTIVER GPS** pour position de récupération
4. Remplir formulaire
5. Soumettre

**Logs attendus côté client** :
```javascript
// Dans CourseExterneFormSync.jsx
console.log('[CLIENT] Course créée:', {
  course_id: response.id,
  statut: "recherche_livreur",
  gps_depart: { lat: 12.345, lng: -1.234 }
});
```

**Logs attendus côté backend** :
```
[DISPATCH] 🚀 Démarrage dispatch pour course xyz789
[DISPATCH] 📦 Course data: {
  id: "xyz789",
  statut: "recherche_livreur",
  gps_depart: { lat: 12.345, lng: -1.234 }
}
```

**✅ Vérifier** :
- [ ] GPS client activé (lat/lng non null)
- [ ] Statut course = "recherche_livreur"
- [ ] Dispatch automatique déclenché

---

### ÉTAPE 3 : Recherche livreurs

**Logs backend attendus** :
```
[DISPATCH] 👥 Livreurs externes trouvés: 5
[DISPATCH] 📍 Livreurs avec GPS valide: 3
[DISPATCH] 📍 GPS coords: [
  { nom: "Test", lat: 12.346, lng: -1.235, last_seen: "2025-05-25T10:00:00Z" }
]
[DISPATCH] 🔍 Recherche dans rayon 3km...
[DISPATCH] 📏 Distance livreur Test: 0.15km (rayon: 3km)
[DISPATCH] ✅ 3 livreurs trouvés dans rayon 3km
[DISPATCH] ✅ Livreurs proches trouvés: 3
```

**✅ Vérifier** :
- [ ] Livreurs trouvés en base (> 0)
- [ ] GPS livreurs valide (position < 5 min)
- [ ] Distance calculée correctement (< 3km, 5km, ou 8km)

**❌ Si aucun livreur** :
- Vérifier statut livreur (= "disponible" ?)
- Vérifier GPS livreur (activé ?)
- Vérifier `app_active` (= true ?)
- Vérifier `validation` (= "valide" ?)
- Vérifier `actif` (= true ?)
- Vérifier `type_livreur` (= "externe" ?)

---

### ÉTAPE 4 : Assignment livreur

**Logs backend attendus** :
```
[DISPATCH] 📏 Distance livreur Test: 0.15km
[DISPATCH] 📝 Mise à jour course: {
  livreur_id: "abc123",
  livreur_nom: "Jean Test",
  dispatch_status: "propose",
  timeout_expires_at: "2025-05-25T10:01:00Z"
}
[DISPATCH] ✅ Course mise à jour avec succès
[DISPATCH] 📱 Envoi notification push à: livreur.test@silgapp2.local
[DISPATCH] ✅ Notification push envoyée
[DISPATCH] ✅ Course proposée au livreur abc123 (Jean Test)
```

**✅ Vérifier** :
- [ ] Course mise à jour avec `livreur_id`
- [ ] `dispatch_status` = "propose"
- [ ] `timeout_expires_at` = 60s dans le futur
- [ ] Notification push envoyée

---

### ÉTAPE 5 : Réception livreur

**Logs frontend livreur attendus** :
```
[LIVREUR] 📦 Courses disponibles: 1 [ { id: "xyz789", dispatch_status: "propose" } ]
[LIVREUR] 📊 État query coursesDisponibles: {
  enabled: true,
  livreur_id: "abc123",
  statut: "disponible",
  gpsActif: true,
  courses_count: 1,
  first_course: "xyz789"
}
[LIVREUR] 🎯 courseEnAttente: {
  id: "xyz789",
  dispatch_status: "propose",
  livreur_id: "abc123",
  statut: "recherche_livreur"
}
```

**✅ Vérifier** :
- [ ] Query activée (`enabled: true`)
- [ ] Course trouvée (count: 1)
- [ ] `courseEnAttente` non null
- [ ] Modal `CourseEnAttenteModal` s'ouvre
- [ ] Vibration activée
- [ ] Son notification joué

**❌ Si modal ne s'ouvre pas** :
- Vérifier `courseEnAttente` non null
- Vérifier z-index modal
- Vérifier React render (DevTools)

---

### ÉTAPE 6 : Acceptation course

**Actions** :
1. Cliquer "Oui, je prends !"
2. Attendre confirmation

**Logs attendus** :
```javascript
// Dans CourseEnAttenteModal.jsx
console.log('[MODAL] Acceptation course xyz789 par livreur abc123');

// Backend
[DISPATCH] Livreur abc123 accepte course xyz789
[DISPATCH] ✅ Course xyz789 acceptée par livreur abc123
```

**✅ Vérifier** :
- [ ] Course statut → "livreur_en_route"
- [ ] `dispatch_status` → "accepte"
- [ ] Livreur statut → "en_course"
- [ ] Modal fermée
- [ ] `CourseActiveCard` affichée

---

### ÉTAPE 7 : Refus course (test alternatif)

**Actions** :
1. Cliquer "Non, occupé"
2. Sélectionner raison ("En cours" ou "Indisponible")
3. Cliquer "Envoyer"

**Logs attendus** :
```
[DISPATCH] Livreur abc123 refuse course xyz789 (raison: en_course)
[DISPATCH] Course proposée au prochain livreur def456
```

**✅ Vérifier** :
- [ ] Course `livreur_id` vidé
- [ ] `dispatch_status` → "recherche_livreur"
- [ ] Prochain livreur trouvé et notifié
- [ ] Modal fermée

---

## 🔍 Diagnostic Problèmes

### Problème : "Aucun livreur trouvé"

**Logs** :
```
[DISPATCH] 👥 Livreurs externes trouvés: 0
```

**Causes possibles** :
1. Aucun livreur externe en base
2. Tous les livreurs sont "hors_ligne"
3. GPS livreurs inactifs
4. `app_active = false`
5. `validation ≠ "valide"`

**Solution** :
```sql
-- Vérifier en base
SELECT id, nom, statut, app_active, latitude, longitude, derniere_position_date
FROM Livreur
WHERE type_livreur = 'externe'
```

---

### Problème : "GPS client invalide"

**Logs** :
```
[DISPATCH] ❌ GPS client invalide: { lat: null, lng: null }
```

**Causes** :
1. Client n'a pas activé GPS
2. Formulaire permet submission sans GPS

**Solution** :
- Rendre GPS obligatoire dans `CourseExterneFormSync.jsx`
- Ajouter validation avant submit

---

### Problème : "Query désactivée"

**Logs** :
```
[LIVREUR] 📊 État query coursesDisponibles: {
  enabled: false,
  statut: "hors_ligne",
  gpsActif: false
}
```

**Causes** :
1. Livreur statut ≠ "disponible"
2. GPS inactif

**Solution** :
- Mettre livreur en ligne (switch statut)
- Activer GPS (bouton "Activer le GPS")

---

### Problème : "Modal ne s'ouvre pas"

**Logs** :
```
[LIVREUR] 🎯 courseEnAttente: null
```

**Causes** :
1. `coursesDisponibles` vide
2. Query désactivée
3. Course déjà expirée

**Solution** :
- Vérifier query enabled
- Vérifier polling 2s
- Vérifier course non expirée

---

### Problème : "Notification push non reçue"

**Logs** :
```
[DISPATCH] ❌ Erreur notification push: ...
```

**Causes** :
1. Token FCM expiré
2. Fonction `envoiNotificationPush` inexistante
3. Permissions push non autorisées

**Solution** :
- Vérifier fonction backend existe
- Vérifier token FCM dans `NotificationToken`
- Réinstaller APK pour reset permissions

---

## 📊 Checklist Finale

### Côté Client :

- [ ] GPS client activé (lat/lng non null)
- [ ] Course créée avec statut "recherche_livreur"
- [ ] Dispatch automatique déclenché
- [ ] Logs backend visibles

### Côté Livreur :

- [ ] Livreur externe connecté
- [ ] Statut = "disponible"
- [ ] GPS activé
- [ ] App ouverte (app_active = true)
- [ ] Query enabled
- [ ] Course trouvée
- [ ] Modal ouverte
- [ ] Notification reçue
- [ ] Vibration activée
- [ ] Son joué

### Côté Backend :

- [ ] Fonction dispatchExterneAuto appelée
- [ ] Logs "[DISPATCH] 🚀 Démarrage"
- [ ] Livreurs trouvés (> 0)
- [ ] Distance calculée
- [ ] Course mise à jour
- [ ] Notification envoyée

---

## 🎯 Test Rapide (5 min)

1. **Connecter livreur** → GPS activé, statut "disponible"
2. **Créer course client** → GPS activé, submit
3. **Vérifier logs backend** → "[DISPATCH] 🚀 Démarrage"
4. **Vérifier logs livreur** → "[LIVREUR] 📦 Courses disponibles: 1"
5. **Vérifier modal** → Doit s'ouvrir avec son + vibration
6. **Accepter course** → Doit se fermer et afficher course active

**✅ Si tout passe** : Dispatch fonctionne !
**❌ Si échec** : Consulter logs à l'étape correspondante

---

**Date** : 2025-05-25
**Version** : 1.0
**Statut** : Prêt à tester