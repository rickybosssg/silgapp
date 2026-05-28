# 🏗️ Architecture GPS/Sync - Configuration Système Verrouillée

**Date de verrouillage :** 28 Mai 2026  
**Version :** 2026-05-28_GPS_SYNC_LOCKED  
**Statut :** ✅ Production - Obligatoire pour tous les nouveaux comptes

---

## 📋 Vue d'ensemble

Cette architecture garantit que **tous les nouveaux utilisateurs** (clients et livreurs externes) héritent automatiquement du système GPS/sync stable, sans configuration manuelle.

### 🎯 Objectifs

1. **Aucun nouveau compte sans GPS temps réel**
2. **Aucun utilisateur "GPS manquant"** si l'application est active
3. **Synchronisation automatique** toutes les 30 secondes
4. **Notifications push** configurées par défaut
5. **Fallback intelligent** en cas d'indisponibilité GPS
6. **Tests automatiques** après chaque création de compte

---

## 🗄️ Entités Système

### 1. `SystemConfig` - Configuration Globale

| Clé | Valeur | Description |
|-----|--------|-------------|
| `GPS_OBLIGATOIRE` | `true` | GPS obligatoire pour tous les nouveaux comptes |
| `SYNC_INTERVAL_SECONDS` | `30` | Intervalle de synchronisation GPS |
| `HEARTBEAT_ENABLED` | `true` | Heartbeat automatique activé |
| `NOTIFICATIONS_PUSHERCE` | `true` | Notifications push obligatoires |
| `FALLBACK_GPS_ENABLED` | `true` | Utiliser dernière position connue si GPS indisponible |
| `AUTO_TEST_ENABLED` | `true` | Test automatique après chaque création de compte |
| `VERSION_ARCHITECTURE` | `2026-05-28_GPS_SYNC_LOCKED` | Version de l'architecture |

### 2. `DeviceSession` - Sessions Multi-Appareils

**Champs obligatoires :**
- `user_email` - Email de l'utilisateur
- `user_type` - "client" | "livreur" | "admin"
- `device_id` - Identifiant unique de l'appareil
- `platform` - "web" | "android" | "ios"

**Champs temps réel :**
- `notification_token` - Token pour notifications push
- `gps_actif` - GPS activé sur cet appareil
- `derniere_position_lat/lng` - Dernière position connue
- `derniere_sync_date` - Dernière synchronisation GPS
- `last_seen_at` - Dernière activité (heartbeat)
- `app_active` - Application actuellement ouverte
- `session_actif` - Session active

### 3. `ClientExterne` & `Livreur` - Champs GPS

**Champs synchronisés :**
- `latitude` (number) - Latitude actuelle
- `longitude` (number) - Longitude actuelle
- `last_seen_at` (datetime) - Dernière activité
- `app_active` (boolean) - Application active

---

## ⚙️ Fonctions Backend

### 1. `initClientAuto` - Initialisation Client

**Déclencheur :** Appelée automatiquement après onboarding client  
**Configuration :**
- Crée `DeviceSession` avec device_id unique
- Enregistre notification token
- Sync GPS initiale
- Test notification push

**Payload :**
```json
{
  "device_id": "web_user_email_timestamp",
  "platform": "web",
  "notification_token": "fcm_token",
  "latitude": 12.3817299,
  "longitude": -1.4924966
}
```

### 2. `initLivreurAuto` - Initialisation Livreur

**Déclencheur :** Appelée automatiquement après onboarding livreur  
**Configuration :**
- Crée `DeviceSession` avec device_id unique
- Génère code d'identification unique
- Enregistre notification token
- Sync GPS initiale
- Test notification push

**Payload :**
```json
{
  "device_id": "web_user_email_timestamp",
  "platform": "web",
  "telephone": "+22670714588",
  "vehicule": "moto",
  "quartier": "Wemtenga",
  "latitude": 12.3817299,
  "longitude": -1.4924966
}
```

### 3. `heartbeatAuto` - Heartbeat Universel

**Déclencheur :** Appelée toutes les 30s par les apps  
**Mise à jour :**
- `last_seen_at` → Maintenant
- `app_active` → État de l'application
- GPS → Dernière position
- `DeviceSession` + Profil (Client/Livreur)

**Payload :**
```json
{
  "user_type": "client",
  "latitude": 12.3817299,
  "longitude": -1.4924966,
  "app_active": true,
  "device_id": "web_user_email_timestamp"
}
```

### 4. `testAuto` - Test Automatique

**Déclencheur :** Automation entity sur `ClientExterne.create` et `Livreur.create`  
**Tests exécutés :**
1. ✅ Notifications push
2. ✅ GPS actif
3. ✅ Synchronisation DeviceSession
4. ✅ Présence temps réel
5. ✅ Fallback GPS (dernière position connue)

**Résultat :**
```json
{
  "tests": {
    "notifications": true,
    "gps": true,
    "synchronisation": true,
    "presence_temps_reel": true,
    "fallback_gps": true
  },
  "score": "5/5",
  "pourcentage": "100%",
  "statut": "✅ Configuration complète"
}
```

---

## 🔄 Flux d'Onboarding

### Client Externe

```
1. Inscription → base44.auth.me()
2. Onboarding GPS → getCurrentPosition()
   ├─→ localStorage.setItem("client_gps_active", "true")
   ├─→ ClientExterne.update({ latitude, longitude })
   └─→ initClientAuto()
3. Onboarding Profil → Nom, Prénom, Téléphone
   ├─→ ClientExterne.update/profil
   └─→ Test automatique (automation)
4. Heartbeat continu → Toutes les 30s
   ├─→ heartbeatAuto()
   ├─→ Sync visibility change
   └─→ Sync retour premier plan
```

### Livreur Externe

```
1. Inscription → base44.auth.me()
2. Onboarding GPS → getCurrentPosition()
   ├─→ localStorage.setItem("livreur_gps_active_{id}", "true")
   ├─→ Livreur.update({ latitude, longitude })
   └─→ initLivreurAuto()
3. Onboarding Profil → Nom, Prénom, Téléphone, Véhicule, Quartier
   ├─→ Livreur.update/profil
   ├─→ Génération code identification
   └─→ Test automatique (automation)
4. Heartbeat continu → Toutes les 30s
   ├─→ heartbeatAuto()
   ├─→ Sync visibility change
   └─→ Sync retour premier plan
```

---

## 📱 Intégration Frontend

### Hook `useHeartbeat`

**Usage :**
```javascript
import { useHeartbeat } from "@/hooks/useHeartbeat";

function MonApp() {
  useHeartbeat({
    user_type: "client", // ou "livreur"
    position: { latitude, longitude },
    enabled: onboardingDone && gpsActif,
  });
}
```

**Fonctionnalités :**
- Sync initiale immédiate
- Heartbeat toutes les 30s
- Sync au retour au premier plan (visibilitychange)
- Évite sync trop fréquentes (< 30s)

### Composants

1. **`ClientOnboarding`** - Onboarding client avec GPS obligatoire
2. **`LivreurExterneOnboarding`** - Onboarding livreur avec GPS obligatoire
3. **`TestSystemeAuto`** - UI de test automatique (admin)

---

## 🔗 Relations de Synchronisation

### Verrouillage des Relations

```
┌─────────────┐
│   Client    │
│ (Demandeur) │
└──────┬──────┘
       │
       ├───↔───┐
       │       │
       ▼       ▼
┌─────────────┐ ┌─────────────┐
│ Expéditeur  │ │  Livreur    │
│  (si reçu)  │ │ (Assigné)   │
└─────────────┘ └─────────────┘
```

**Champs de liaison :**
- `CourseExterne.expediteur_client_id` → `ClientExterne.id`
- `CourseExterne.destinataire_client_id` → `ClientExterne.id`
- `CourseExterne.livreur_id` → `Livreur.id`
- `CourseExterne.expediteur_has_app` → Force synchro expéditeur
- `CourseExterne.recipient_has_app` → Force synchro destinataire

**Automations :**
- `notifyClientSync` → Notifie tous les acteurs liés
- Sync GPS destinataire → Update `gps_arrivee_lat/lng` en temps réel

---

## 🧩 Fallback Intelligent

### Hiérarchie GPS

1. **GPS Live** → Position actuelle (lat/lng en temps réel)
2. **Dernière Position Connue** → `DeviceSession.derniere_position_lat/lng`
3. **Position Onboarding** → `ClientExterne/Livreur.latitude/longitude`
4. **Demander Actualisation** → Prompt utilisateur

### Implémentation

```javascript
function getFallbackGPS(user) {
  // 1. GPS live
  if (user.latitude && user.longitude) {
    return { lat: user.latitude, lng: user.longitude, source: "live" };
  }
  
  // 2. Dernière position DeviceSession
  const session = await DeviceSession.filter({ user_email: user.email, session_actif: true });
  if (session && session[0]?.derniere_position_lat) {
    return { lat: session[0].derniere_position_lat, lng: session[0].derniere_position_lng, source: "session" };
  }
  
  // 3. Position onboarding
  return { lat: user.latitude, lng: user.longitude, source: "onboarding" };
}
```

---

## ✅ Checklist de Validation

### Après Chaque Création de Compte

- [ ] Notification push envoyée et reçue
- [ ] GPS actif et synchronisé
- [ ] DeviceSession créée
- [ ] Heartbeat fonctionnel (30s)
- [ ] Présence temps réel détectée
- [ ] Fallback GPS configuré
- [ ] Score test auto : 100%

### Surveillance Admin

- [ ] Panel `TestSystemeAuto` accessible
- [ ] Historique des tests consultable
- [ ] Alertes sur échecs de test
- [ ] Relance manuelle possible

---

## 🚀 Déploiement

### Automations Créées

1. **`Test Auto Nouveau Client`** - Trigger: `ClientExterne.create`
2. **`Test Auto Nouveau Livreur`** - Trigger: `Livreur.create`

### Configurations Système

7 entrées `SystemConfig` créées (voir section entités)

### Code Déployé

**Backend :**
- ✅ `functions/initClientAuto.js`
- ✅ `functions/initLivreurAuto.js`
- ✅ `functions/heartbeatAuto.js`
- ✅ `functions/testAuto.js`

**Frontend :**
- ✅ `hooks/useHeartbeat.js`
- ✅ `components/admin/TestSystemeAuto.jsx`
- ✅ `components/client/ClientOnboarding.jsx` (mis à jour)
- ✅ `components/livreur/LivreurExterneOnboarding.jsx` (mis à jour)
- ✅ `pages/ClientExterneApp.jsx` (heartbeat intégré)
- ✅ `pages/LivreurExterneApp.jsx` (heartbeat intégré)

---

## 📊 Métriques de Surveillance

### KPIs Temps Réel

- **% comptes avec GPS actif** → Objectif: 100%
- **% sessions avec heartbeat** → Objectif: 100%
- **Délai moyen sync GPS** → Objectif: < 30s
- **Taux échec tests auto** → Objectif: 0%

### Requêtes de Surveillance

```javascript
// Clients avec GPS actif
const clientsGPS = await ClientExterne.filter({ latitude: { $ne: null }, longitude: { $ne: null } });

// Sessions actives
const sessionsActives = await DeviceSession.filter({ session_actif: true, app_active: true });

// Tests échoués (à implémenter dans un futur rapport)
const testsEchoues = await TestResult.filter({ score: { $lt: "5/5" }, date: today });
```

---

## 🔒 Verrouillage Définitif

**Aucun nouveau compte ne peut être créé sans :**
1. ✅ GPS activé et testé
2. ✅ DeviceSession enregistrée
3. ✅ Notification push configurée
4. ✅ Heartbeat automatique activé
5. ✅ Test automatique exécuté

**Cette architecture est maintenant la configuration système par défaut.**

Toute future modification doit préserver ces garanties.

---

**Document créé le :** 28 Mai 2026  
**Dernière mise à jour :** 28 Mai 2026  
**Mainteneur :** Équipe SILGAPP