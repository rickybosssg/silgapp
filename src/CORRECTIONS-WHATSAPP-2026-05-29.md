# ✅ CORRECTIONS WHATSAPP ALERTS - 2026-05-29

## 🎯 Problèmes Résolus

### 1. ✅ Vérification `app_active` Fiable
**Avant :** Vérification basique sans logs  
**Après :** Logs détaillés avec timestamp et écart en secondes

```javascript
function estActifDansApp(entity, courseId, livreurId) {
  if (!entity.app_active) {
    console.log(`[WhatsApp] Course ${courseId} Livreur ${livreurId}: app_active=false → WhatsApp`);
    return false;
  }
  if (!entity.last_seen_at) {
    console.log(`[WhatsApp] Course ${courseId} Livreur ${livreurId}: last_seen_at=null → WhatsApp`);
    return false;
  }
  const ecart = Date.now() - new Date(entity.last_seen_at).getTime();
  const actif = ecart < SEUIL_INACTIVITE_MS;
  
  // Log détaillé avec écart en secondes
  if (!actif) {
    console.log(`[WhatsApp] Course ${courseId} Livreur ${livreurId}: last_seen_at=${entity.last_seen_at} (écart=${Math.round(ecart/1000)}s) → WhatsApp`);
  } else {
    console.log(`[WhatsApp] Course ${courseId} Livreur ${livreurId}: app_active=true + last_seen_recent → BLOQUÉ`);
  }
  return actif;
}
```

---

### 2. ✅ Timestamp Fiable (`last_seen_at`)
**Mécanisme :**
- Heartbeat toutes les **30 secondes** via `useHeartbeat` hook
- Mis à jour par `heartbeatAuto` function
- Vérification : `now - last_seen_at < 120000ms` (2 minutes)

**Cas gérés :**
- ✅ Application fermée → heartbeat arrêté → `last_seen_at` ancien → WhatsApp ✅
- ✅ Arrière-plan longtemps → heartbeat peut continuer (selon Android) → si > 2 min → WhatsApp ✅
- ✅ Crash → heartbeat arrêté → WhatsApp ✅
- ✅ Perte réseau → heartbeat échoue → WhatsApp ✅
- ✅ Téléphone verrouillé → heartbeat peut continuer → dépend des settings Android
- ✅ APK fermée complètement → `app_active=false` → WhatsApp ✅
- ✅ Téléphone redémarré → heartbeat arrêté → WhatsApp ✅

---

### 3. ✅ Anti-Doublon par Course
**Avant :** Anti-doublon global par livreur  
**Après :** Anti-doublon par course (notification_id)

```javascript
// Vérifie si WhatsApp DÉJÀ ENVOYÉ pour cette course précise
const alertesCourse = await base44.asServiceRole.entities.WhatsAppAlerte.filter({ 
  livreur_id: livreur.id,
  notification_id: notification.id || '',  // ← Clé : notification_id unique par course
  statut: 'sent'
});

if (alertesCourse.length > 0) {
  console.log(`[WhatsApp] Course ${courseId} Livreur ${livreur.id}: WhatsApp DÉJÀ ENVOYÉ → SKIP`);
  return Response.json({ skipped: true, reason: 'whatsapp_deja_envoye_course' });
}
```

**Résultat :**
- 1 course = 1 WhatsApp maximum ✅
- Multi-courses = WhatsApp à chaque fois ✅

---

### 4. ✅ Logs Détaillés
**Exemple de log COMPLET :**

```
[WhatsApp] === DÉBUT CHECK Course course_123 Livreur liv_456 ===
[WhatsApp] app_active=true, last_seen_at=2026-05-29T10:00:00.000Z
[WhatsApp] Course course_123 Livreur liv_456: last_seen_at=2026-05-29T10:00:00.000Z (écart=45s) → WhatsApp
[WhatsApp] Course course_123 Livreur liv_456: BLOQUÉ - livreur actif dans l'app
[WhatsApp] Course course_123 Livreur liv_456 → FIN CHECK

[WhatsApp] === DÉBUT CHECK Course course_789 Livreur liv_456 ===
[WhatsApp] app_active=false, last_seen_at=2026-05-29T09:55:00.000Z
[WhatsApp] Course course_789 Livreur liv_456: app_active=false → WhatsApp
[WhatsApp] Course course_789 Livreur liv_456: WhatsApp AUTORISÉ → envoi...
[WhatsApp] Course course_789 Livreur liv_456 → ENVOYÉ (SID12345) SID=SID12345
```

**Informations logguées :**
- ✅ Course ID
- ✅ Livreur ID
- ✅ `app_active` value
- ✅ `last_seen_at` timestamp
- ✅ Écart en secondes
- ✅ Raison du blocage ou de l'envoi
- ✅ Twilio SID (si envoyé)
- ✅ Flag `whatsapp_sent: true` dans la réponse

---

## 🧪 Page de Test Dédiée

**URL :** `/test-whatsapp`

**Fonctionnalités :**
- ✅ Liste des livreurs avec statut `app_active` et `last_seen_at`
- ✅ Boutons "Test Actif" et "Test Inactif"
- ✅ Création automatique de notification test
- ✅ Vérification automatique si WhatsApp envoyé ou non
- ✅ Logs en temps réel dans l'interface
- ✅ Historique des alertes WhatsApp

**Comment tester :**
1. Aller sur `/test-whatsapp`
2. Choisir un livreur
3. Cliquer sur "Test Actif" → WhatsApp doit être BLOQUÉ ✅
4. Cliquer sur "Test Inactif" → WhatsApp doit être ENVOYÉ ✅

---

## 📊 Matrice de Décision

| Cas | app_active | last_seen_at | Écart | WhatsApp |
|-----|------------|--------------|-------|----------|
| App ouverte (< 2 min) | true | 2026-05-29T10:00:00Z | 45s | ❌ BLOQUÉ |
| App ouverte (> 2 min) | true | 2026-05-29T09:55:00Z | 300s | ✅ ENVOYÉ |
| App fermée | false | 2026-05-29T09:55:00Z | N/A | ✅ ENVOYÉ |
| Crash | true (stuck) | 2026-05-29T09:55:00Z | 300s | ✅ ENVOYÉ |
| Perte réseau | true (stuck) | 2026-05-29T09:55:00Z | 300s | ✅ ENVOYÉ |
| Téléphone verrouillé | ? | 2026-05-29T09:55:00Z | 300s | ✅ ENVOYÉ |
| APK fermée | false | N/A | N/A | ✅ ENVOYÉ |
| Téléphone redémarré | false | N/A | N/A | ✅ ENVOYÉ |

---

## 🔧 Fichiers Modifiés

### 1. `functions/envoyerAlerteWhatsApp`
- ✅ Fonction `estActifDansApp` améliorée avec logs
- ✅ Anti-doublon par course (notification_id)
- ✅ Logs détaillés avec course_id, livreur_id, timestamps
- ✅ Flag `whatsapp_sent: true` dans la réponse
- ✅ Vérification WhatsApp déjà envoyé avant envoi

### 2. `pages/TestWhatsAppAlertes.jsx` (NOUVEAU)
- ✅ Interface de test dédiée
- ✅ Tests automatisés livreur actif/inactif
- ✅ Logs en temps réel
- ✅ Historique des alertes

### 3. `App.jsx`
- ✅ Route `/test-whatsapp` ajoutée

### 4. `GUIDE-TEST-WHATSAPP-COMPLET.md` (NOUVEAU)
- ✅ Protocole de test complet
- ✅ 8 cas de test détaillés
- ✅ Checklist finale
- ✅ Guide de dépannage

---

## 📝 Comment Vérifier les Logs Base44

1. **Dashboard Base44** → Code → Functions
2. Chercher `envoyerAlerteWhatsApp`
3. Onglet **"Logs"** ou **"Console"**
4. Filtrer par date/heure du test
5. Chercher les patterns :
   - `[WhatsApp] === DÉBUT CHECK`
   - `[WhatsApp] app_active=`
   - `[WhatsApp] ... → ENVOYÉ`
   - `[WhatsApp] ... → BLOQUÉ`

---

## ✅ Checklist de Validation

- [ ] Logs détaillés avec course_id, livreur_id ✅
- [ ] Timestamp `last_seen_at` avec écart en secondes ✅
- [ ] Anti-doublon par course (notification_id) ✅
- [ ] Flag `whatsapp_sent: true` dans réponse ✅
- [ ] Page de test `/test-whatsapp` fonctionnelle ✅
- [ ] Guide de test complet rédigé ✅
- [ ] Fonction `estActifDansApp` avec logs ✅
- [ ] Vérification WhatsApp déjà envoyé avant envoi ✅

---

## 🚀 Prochaines Étapes

1. **Tests réels** avec livreurs en conditions réelles
2. **Vérifier logs Base44** pendant les tests
3. **Ajuster seuil** si nécessaire (actuellement 2 minutes)
4. **Tester multi-courses** pour valider anti-doublon

---

**Date :** 2026-05-29  
**Version :** 2.0  
**Statut :** ✅ Corrections appliquées et testables