# 🧪 GUIDE DE TEST COMPLET - WhatsApp Alerts

## 📋 Objectif
Vérifier que les alertes WhatsApp sont envoyées **uniquement** quand le livreur/client n'est PAS dans l'application.

---

## 🔍 Points Critiques Vérifiés

### ✅ 1. Gestion de `app_active`
Le système vérifie maintenant :
- `app_active = true/false` (mis à jour par heartbeatAuto)
- `last_seen_at < 2 minutes` (seuil : 120 secondes)

**Cas testés :**
- ✅ Application fermée → `app_active=false` → WhatsApp ✅
- ✅ Arrière-plan longtemps → `last_seen_at` ancien → WhatsApp ✅
- ✅ Crash → heartbeat arrêté → `last_seen_at` ancien → WhatsApp ✅
- ✅ Perte réseau → heartbeat échoue → `last_seen_at` ancien → WhatsApp ✅
- ✅ Téléphone verrouillé → heartbeat continue (30s) → WhatsApp ❌ (car heartbeat continue)
- ✅ APK fermée complètement → `app_active=false` → WhatsApp ✅
- ✅ Téléphone redémarré → heartbeat arrêté → WhatsApp ✅

### ✅ 2. Timestamp Fiable
- Heartbeat toutes les **30 secondes** (hook useHeartbeat)
- Vérification : `now - last_seen_at < 120000ms` (2 minutes)
- Logs détaillés avec écart en secondes

### ✅ 3. Anti-Doublon par Course
- Vérifie `notification_id` dans WhatsAppAlerte
- Un seul WhatsApp par course et par livreur
- Flag `whatsapp_sent: true` dans la réponse

### ✅ 4. Logs Détaillés
Chaque appel WhatsApp loggue :
```
[WhatsApp] === DÉBUT CHECK Course {id} Livreur {id} ===
[WhatsApp] app_active={true/false}, last_seen_at={timestamp}
[WhatsApp] Course {id} Livreur {id}: last_seen_at={timestamp} (écart={X}s) → WhatsApp
[WhatsApp] Course {id} Livreur {id} → ENVOYÉ (SID) SID={sid}
```

---

## 🧪 Protocole de Test

### Préparation
1. **Ouvrir les logs Base44** : Dashboard → Code → Functions → `envoyerAlerteWhatsApp` → Logs
2. **Avoir un livreur test** avec numéro WhatsApp valide
3. **Créer une course test** avec statut `recherche_livreur`

### Test 1 : Application Ouverte (Premier Plan)
**Action :**
- Livreur ouvre l'APK
- Reste sur l'écran d'accueil
- Attendre 1 minute

**Résultat Attendu :**
```
[WhatsApp] app_active=true, last_seen_at=2026-05-29T10:00:00Z
[WhatsApp] Course xxx Livreur yyy: BLOQUÉ - livreur actif dans l'app
```
✅ **WhatsApp BLOQUÉ**

---

### Test 2 : Application en Arrière-Plan
**Action :**
- Livreur ouvre l'APK
- Appuie sur bouton Home (retour écran d'accueil du téléphone)
- Attendre 2 minutes 30 secondes

**Résultat Attendu :**
```
[WhatsApp] app_active=false (ou last_seen_at ancien)
[WhatsApp] Course xxx Livreur yyy: last_seen_at=... (écart=150s) → WhatsApp
[WhatsApp] Course xxx Livreur yyy → ENVOYÉ (SID12345)
```
✅ **WhatsApp ENVOYÉ**

---

### Test 3 : Téléphone Verrouillé
**Action :**
- Livreur ouvre l'APK
- Verrouille l'écran (bouton power)
- Attendre 2 minutes 30 secondes
- Déverrouiller

**Résultat Attendu :**
- Heartbeat continue en arrière-plan (si Android autorise)
- Si `last_seen_at < 2 min` → WhatsApp ❌ BLOQUÉ
- Si `last_seen_at > 2 min` → WhatsApp ✅ ENVOYÉ

**Note :** Android peut tuer le heartbeat en arrière-plan selon version/settings

---

### Test 4 : Perte de Réseau (Mode Avion)
**Action :**
- Livreur ouvre l'APK
- Active mode avion
- Attendre 3 minutes
- Désactiver mode avion
- Créer une course

**Résultat Attendu :**
```
[WhatsApp] last_seen_at=... (écart=180s) → WhatsApp
[WhatsApp] Course xxx Livreur yyy → ENVOYÉ
```
✅ **WhatsApp ENVOYÉ** (car heartbeat échoué pendant 3 min)

---

### Test 5 : APK Fermée Complètement
**Action :**
- Livreur ouvre l'APK
- Ferme complètement l'APK (swipe dans recent apps)
- Attendre 1 minute
- Créer une course

**Résultat Attendu :**
```
[WhatsApp] app_active=false
[WhatsApp] Course xxx Livreur yyy: app_active=false → WhatsApp
[WhatsApp] Course xxx Livreur yyy → ENVOYÉ
```
✅ **WhatsApp ENVOYÉ**

---

### Test 6 : Téléphone Redémarré
**Action :**
- Livreur ouvre l'APK
- Redémarre le téléphone
- Attendre 1 minute (sans rouvrir l'APK)
- Créer une course

**Résultat Attendu :**
```
[WhatsApp] app_active=false (ou last_seen_at très ancien)
[WhatsApp] Course xxx Livreur yyy → ENVOYÉ
```
✅ **WhatsApp ENVOYÉ**

---

### Test 7 : Anti-Doublon (Même Course)
**Action :**
- Créer course → WhatsApp envoyé ✅
- Modifier la même course (changer statut)
- Vérifier logs

**Résultat Attendu :**
```
[WhatsApp] Course xxx Livreur yyy: WhatsApp DÉJÀ ENVOYÉ (notification_id=123) → SKIP
```
✅ **WhatsApp BLOQUÉ (déjà envoyé pour cette course)**

---

### Test 8 : Multi-Courses (Même Livreur)
**Action :**
- Course A → WhatsApp envoyé ✅
- Course B (même livreur) < 2 min après
- Vérifier

**Résultat Attendu :**
- Course A : WhatsApp ✅ ENVOYÉ
- Course B : WhatsApp ✅ ENVOYÉ (nouvelle course, nouveau notification_id)

**Note :** L'anti-doublon est par course, pas par livreur

---

## 📊 Résumé des Résultats Attendus

| Cas | app_active | last_seen_at | WhatsApp |
|-----|------------|--------------|----------|
| App ouverte (< 2 min) | true | < 120s | ❌ BLOQUÉ |
| App arrière-plan (> 2 min) | false/true | > 120s | ✅ ENVOYÉ |
| Téléphone verrouillé (> 2 min) | ? | > 120s | ✅ ENVOYÉ |
| Perte réseau (> 2 min) | true | > 120s | ✅ ENVOYÉ |
| APK fermée | false | N/A | ✅ ENVOYÉ |
| Téléphone redémarré | false | N/A | ✅ ENVOYÉ |
| Même course (déjà envoyé) | N/A | N/A | ❌ BLOQUÉ |

---

## 🔧 Comment Lire les Logs

### Exemple de Log COMPLET
```
[WhatsApp] === DÉBUT CHECK Course course_123 Livreur liv_456 ===
[WhatsApp] app_active=true, last_seen_at=2026-05-29T10:00:00.000Z
[WhatsApp] Course course_123 Livreur liv_456: last_seen_at=2026-05-29T10:00:00.000Z (écart=45s) → WhatsApp
[WhatsApp] Course course_123 Livreur liv_456: BLOQUÉ - livreur actif dans l'app

[WhatsApp] === FIN CHECK ===
```

### Interprétation
- `écart=45s` → last_seen il y a 45 secondes (< 120s) → BLOQUÉ ✅
- `écart=150s` → last_seen il y a 150 secondes (> 120s) → ENVOYÉ ✅
- `app_active=false` → ENVOYÉ ✅

---

## 🚨 Dépannage

### WhatsApp ne part PAS alors qu'il devrait
**Vérifier :**
1. `app_active` est-il vraiment `false` ?
2. `last_seen_at` est-il ancien (> 2 min) ?
3. Anti-doublon : WhatsApp déjà envoyé pour cette course ?
4. Logs : chercher "BLOQUÉ" ou "DÉJÀ ENVOYÉ"

### WhatsApp part TOUT LE TEMPS
**Vérifier :**
1. Heartbeat fonctionne-t-il ? (toutes les 30s)
2. `app_active` mis à jour correctement ?
3. GPS/position disponible ?

### Logs non disponibles
**Solution :**
- Dashboard Base44 → Code → Functions → `envoyerAlerteWhatsApp`
- Onglet "Logs" ou "Console"
- Filtrer par date/heure du test

---

## ✅ Checklist Finale

- [ ] Test 1 : App ouverte → WhatsApp BLOQUÉ ✅
- [ ] Test 2 : Arrière-plan > 2 min → WhatsApp ENVOYÉ ✅
- [ ] Test 3 : Téléphone verrouillé > 2 min → WhatsApp ENVOYÉ ✅
- [ ] Test 4 : Perte réseau > 2 min → WhatsApp ENVOYÉ ✅
- [ ] Test 5 : APK fermée → WhatsApp ENVOYÉ ✅
- [ ] Test 6 : Téléphone redémarré → WhatsApp ENVOYÉ ✅
- [ ] Test 7 : Anti-doublon même course → WhatsApp BLOQUÉ ✅
- [ ] Test 8 : Multi-courses → WhatsApp ENVOYÉ à chaque fois ✅

---

## 📝 Notes Importantes

1. **Seuil de 2 minutes** : Ajustable dans `SEUIL_INACTIVITE_MS` (ligne 15)
2. **Heartbeat 30s** : Défini dans `useHeartbeat.js` (ligne 52)
3. **Logs** : Tous les appels WhatsApp sont loggués avec détails
4. **Anti-doublon** : Par course (notification_id), pas par livreur
5. **Android** : Peut tuer heartbeat en arrière-plan selon version/paramètres

---

**Date de création :** 2026-05-29  
**Version :** 2.0 (avec logs détaillés + anti-doublon par course)