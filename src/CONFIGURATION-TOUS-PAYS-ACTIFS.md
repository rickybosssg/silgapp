# ⚙️ CONFIGURATION SILGAPP - TOUS PAYS ACTIVÉS

**Date** : 1 Juin 2026  
**Statut** : ✅ Tous les pays actifs et configurés

---

## 🌍 PAYS SILGAPP (8/8 ACTIFS)

| # | Pays | Code | Indicatif | Devise | Prix/km | Min. | Ville | Rayon | Coords |
|---|------|------|-----------|--------|---------|------|-------|-------|--------|
| 1 | **Burkina Faso** 🇧🇫 | BF | +226 | FCFA | 100 | 500 | Ouagadougou | 30km | 12.3569, -1.5353 |
| 2 | **Côte d'Ivoire** 🇨🇮 | CI | +225 | FCFA | 120 | 600 | Abidjan | 40km | 5.3599, -4.0082 |
| 3 | **Togo** 🇹🇬 | TG | +228 | FCFA | 100 | 500 | Lomé | 25km | 6.1375, 1.2123 |
| 4 | **Bénin** 🇧🇯 | BJ | +229 | FCFA | 100 | 500 | Cotonou | 25km | 6.3654, 2.4183 |
| 5 | **Sénégal** 🇸🇳 | SN | +221 | FCFA | 150 | 750 | Dakar | 35km | 14.7167, -17.4677 |
| 6 | **Mali** 🇲🇱 | ML | +223 | FCFA | 100 | 500 | Bamako | 30km | 12.6392, -8.0029 |
| 7 | **Guinée** 🇬🇳 | GN | +224 | GNF | 800 | 4000 | Conakry | 30km | 9.537, -13.6773 |
| 8 | **Niger** 🇳🇪 | NE | +227 | FCFA | 100 | 500 | Niamey | 25km | 13.5137, 2.1098 |

**Commission SILGAPP** : 30% (identique tous pays)

---

## ✅ CONFIGURATIONS APPLIQUÉES

### 1. **GPS & Tracking**
- ✅ GPS web standard (`navigator.geolocation.watchPosition`)
- ✅ Heartbeat toutes les 60 secondes
- ✅ Sync automatique position (10s intervalle)
- ✅ Fonctions : `syncLivreurGPS`, `syncClientGPS`, `forceClientGPSSync`

### 2. **Dispatch Automatique**
- ✅ Fonction : `dispatchExterneAuto`
- ✅ Rayon recherche : 3-8km (ajustable)
- ✅ Timeout : 60 secondes
- ✅ Redispatch automatique si refus/expire

### 3. **Notifications**
- ✅ WhatsApp via Twilio (`envoyerAlerteWhatsApp`)
- ✅ Push notifications Firebase
- ✅ Tokens enregistrés par appareil

### 4. **Séparation Réseaux**
- ✅ `Livreur.type_livreur` : `interne` | `externe`
- ✅ `Course.reseau` : `interne` | `externe`
- ✅ `CourseExterne` : entité dédiée réseau externe
- ✅ `ClientExterne` : entité dédiée clients

### 5. **Paiements & Commissions**
- ✅ `commission_pct` : 30% (configurable par pays)
- ✅ `prix_par_km` : variable par pays
- ✅ `prix_minimum` : variable par pays
- ✅ Fonction : `paiementLivreur`

### 6. **QR Codes & Validation**
- ✅ Tokens uniques : `pickup_qr_token`, `delivery_qr_token`
- ✅ Codes 4 chiffres : `pickup_code_4_digits`, `delivery_code_4_digits`
- ✅ Fonction : `validateQRCode`

### 7. **Maintenance & Nettoyage**
- ✅ `maintenanceNuit` : nettoyage automatique
- ✅ `nettoyerCoursesFantomes` : courses orphelines
- ✅ `nettoyerCourseAnnulee` : libération livreurs

---

## 📱 APPLICATIONS PAR RÉSEAU

### **Réseau Interne** (LivreurApp.jsx)
- Dashboard : `/`
- Courses : `Course` entity
- Livreurs : `Livreur.type_livreur = "interne"`

### **Réseau Externe** (LivreurExterneApp.jsx, ClientExterneApp.jsx)
- Dashboard Client : `/`
- Dashboard Admin : `/admin/externe`
- Courses : `CourseExterne` entity
- Livreurs : `Livreur.type_livreur = "externe"`

---

## 🔄 SYNCHRONISATION TEMPS RÉEL

### **Abonnements Entity**
```javascript
base44.entities.CourseExterne.subscribe((event) => {
  // Temps réel : create, update, delete
  refetch();
});

base44.entities.Livreur.subscribe((event) => {
  // Mise à jour statut, position GPS
  queryClient.invalidateQueries();
});
```

### **Heartbeat**
- **Client** : `app_active` + `last_seen_at` (60s)
- **Livreur** : `app_active` + `last_seen_at` (60s)
- **GPS** : Position toutes les 10s (livreur en course)

---

## 🎯 SÉLECTEUR PAYS (CountrySelector.jsx)

**Composant utilisé dans** :
- `CarteLivreursExterne` (top-right)
- `DispatchMap` (bottom-left overlay)
- `DashboardAdminExterne` (filtres)
- `GestionPays` (administration)

**Fallback** : Données statiques `PAYS_SILGAPP` si API indisponible

---

## 📊 CARTE DISPATCH (CarteLivreursExterne.jsx)

**Code couleur unifié** :
- ⚫ **Noir** : Hors ligne / GPS > 10 min (livreur) ou > 30 min (client)
- 🟢 **Vert** : Livreur libre (disponible + ON + GPS < 5 min + app active)
- 🟠 **Orange** : Livreur en course (statut `en_course` + ON + GPS < 10 min)
- 🔵 **Bleu** : Client actif (GPS < 30 min + app active)
- 🔴 **Rouge** : Course en attente (sans livreur assigné)

**Heatmaps disponibles** :
- `demande` : Clients + Courses (zones de demande)
- `couverture` : Livreurs disponibles/en course
- `opportunite` : Demande - Couverture (zones sous-desservies)

---

## 🔧 BACKEND FUNCTIONS (38 fonctions)

**Core** :
- `dispatchExterneAuto` : Dispatch automatique livreurs externes
- `dispatchMoteur` : Moteur de dispatch (refus, redispatch)
- `calculPrixCourseExterne` : Calcul prix avec params pays

**GPS/Sync** :
- `syncLivreurGPS`, `syncClientGPS` : Synchronisation positions
- `forceClientGPSSync` : Sync manuelle client
- `heartbeatAuto` : Heartbeat automatique

**Notifications** :
- `envoyerAlerteWhatsApp` : Alerte Twilio WhatsApp
- `envoiNotificationPush` : Push Firebase
- `enregistrerTokenPush` : Enregistrement tokens

**Maintenance** :
- `maintenanceNuit` : Nettoyage nocturne
- `nettoyerCoursesFantomes` : Courses orphelines
- `reparationPrix` : Correction prix manquants

**Auth/Validation** :
- `validateQRCode` : Validation QR pickup/delivery
- `validateCourseRoles` : Vérification permissions
- `findLivreurByCode` : Connexion livreur par code

---

## ✅ CHECKLIST DÉPLOIEMENT MULTI-PAYS

- [x] 8 pays activés dans `Country`
- [x] Coordonnées GPS centres configurées
- [x] Tarifs personnalisés (prix/km, minimum)
- [x] Indicatifs téléphoniques configurés
- [x] Devises configurées (FCFA, GNF)
- [x] Commission SILGAPP (30%)
- [x] Sélecteur pays fonctionnel
- [x] Carte dispatch multi-pays
- [x] Fonctions backend compatibles tous pays
- [x] Heartbeat & GPS sync opérationnels
- [x] Notifications WhatsApp/Push configurées
- [x] QR codes validation opérationnels

---

## 🚀 PROCHAINES ÉTAPES

1. **Tests terrain** par pays (GPS, dispatch, notifications)
2. **Ajustement tarifs** si nécessaire (concurrence locale)
3. **Recrutement livreurs** par pays
4. **Support WhatsApp** par pays (numéros locaux)
5. **Analytics** : Suivi performance par pays

---

**Architecture** : Entités séparées (`Livreur`, `ClientExterne`, `Course`, `CourseExterne`)  
**GPS** : Web API standard (`navigator.geolocation`)  
**Dispatch** : Automatique (60s timeout, 3-8km rayon)  
**Paiements** : 30% commission SILGAPP + variables par pays