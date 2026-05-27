# 🔍 GUIDE DE TEST COMPLET - SILGAPP EXTERNE

## Objectif
Identifier PRÉCISÉMENT où chaque bug se produit dans la chaîne complète.

---

## 📋 CHECKLIST DE TEST - CHAÎNE COMPLÈTE

### **TEST 1 : CRÉATION DE COURSE "EXPÉDIER"**
**Profil :** Client (expéditeur)

1. Ouvrir `ClientExterneApp`
2. Cliquer sur "Expédier un colis"
3. Remplir le formulaire :
   - Type : Expédier
   - Adresse départ : "Ouaga 2000"
   - GPS départ : ✅ Bouton "Utiliser GPS"
   - Adresse arrivée : "Gounougou"
   - GPS arrivée : ✅ Bouton "Utiliser GPS"
   - Destinataire : Nom + Téléphone (+226 XX XX XX XX)
   - Type colis : "petit_colis"
   - Notes : "Test diagnostic"

**✅ Points à vérifier :**
- [ ] GPS départ sauvegardé (`gps_depart_lat`, `gps_depart_lng`)
- [ ] GPS arrivée sauvegardé (`gps_arrivee_lat`, `gps_arrivee_lng`)
- [ ] Prix estimé affiché (distance × 100)
- [ ] Destinataire normalisé (+226...)
- [ ] Course créée avec statut `recherche_livreur`

**🐛 Bugs à chercher :**
- [ ] GPS = null après création
- [ ] Prix = 0 ou undefined
- [ ] Téléphone non normalisé

---

### **TEST 2 : DISPATCH AUTOMATIQUE**
**Profil :** Admin Dashboard Externe

1. Ouvrir `DashboardAdminExterne`
2. Trouver la course créée
3. Vérifier le dispatch

**✅ Points à vérifier :**
- [ ] Course apparaît dans "Courses en traitement"
- [ ] Bouton "Dispatch auto" fonctionne
- [ ] Livreur assigné dans les 60s
- [ ] `dispatch_status` passe à "propose"
- [ ] `livreur_id` renseigné
- [ ] QR codes générés (`pickup_qr_token`, `delivery_qr_token`)

**🐛 Bugs à chercher :**
- [ ] Aucun livreur trouvé (vérifier GPS livreurs)
- [ ] Timeout > 60s sans redispatch
- [ ] QR codes non générés

---

### **TEST 3 : ACCEPTATION PAR LE LIVREUR**
**Profil :** Livreur Externe

1. Ouvrir `LivreurExterneApp`
2. Activer GPS (obligatoire)
3. Passer "En ligne"
4. Attendre notification course
5. Accepter la course

**✅ Points à vérifier :**
- [ ] GPS livreur actif (`latitude`, `longitude`, `derniere_position_date`)
- [ ] Course apparaît dans "Courses"
- [ ] Modal d'acceptation avec détails
- [ ] Bouton "Accepter" fonctionne
- [ ] `statut` passe à `livreur_en_route`
- [ ] `dispatch_status` passe à "accepte"
- [ ] `heure_acceptation` enregistrée

**🐛 Bugs à chercher :**
- [ ] GPS livreur = null
- [ ] Course n'apparaît pas
- [ ] Statut ne change pas

---

### **TEST 4 : ETA TEMPS RÉEL (CRITIQUE)**
**Profils :** Livreur + Expéditeur + Destinataire

#### **Côté LIVREUR :**
1. Ouvrir `LivreurExterneApp`
2. Voir la course active
3. Vérifier bloc de navigation

**✅ Points à vérifier :**
- [ ] Bouton "Naviguer vers la récupération" visible
- [ ] Distance affichée (ex: "2.3 km")
- [ ] ETA affiché (ex: "~5 min")
- [ ] Boutons Google Maps / Waze fonctionnent
- [ ] GPS livreur se met à jour toutes les 15s

**🐛 Bugs à chercher :**
- [ ] ETA = null ou "NaN"
- [ ] Distance = 0 ou null
- [ ] Bouton navigation masqué
- [ ] GPS ne se met pas à jour

#### **Côté EXPÉDITEUR :**
1. Ouvrir `ClientExterneApp`
2. Aller dans "Mes courses"
3. Voir la course en cours

**✅ Points à vérifier :**
- [ ] Livreur affiché avec photo/nom
- [ ] ETA affiché : "Le livreur arrive dans ~5 min"
- [ ] Distance affichée
- [ ] Mise à jour toutes les 5s

**🐛 Bugs à chercher :**
- [ ] ETA masqué
- [ ] "undefined" ou "null" affiché
- [ ] Pas de mise à jour temps réel

#### **Côté DESTINATAIRE (si course "expedier") :**
1. Ouvrir lien de suivi ou `ClientSuiviCourse`
2. Vérifier ETA

**✅ Points à vérifier :**
- [ ] ETA affiché après "Colis récupéré"
- [ ] Position GPS du livreur visible
- [ ] Bouton WhatsApp vers livreur fonctionne

---

### **TEST 5 : NAVIGATION VERS RÉCUPÉRATION**
**Profil :** Livreur

1. Cliquer sur "Naviguer vers la récupération"
2. GPS s'ouvre avec itinéraire

**✅ Points à vérifier :**
- [ ] Google Maps/Waze s'ouvre
- [ ] Destination = `gps_depart_lat`, `gps_depart_lng`
- [ ] Itinéraire calculé

**🐛 Bugs à chercher :**
- [ ] Coordonnées incorrectes
- [ ] Navigation vers mauvaise adresse

---

### **TEST 6 : SCAN QR RÉCUPÉRATION**
**Profil :** Livreur + Expéditeur

1. **Expéditeur :** Ouvrir QR code de récupération
2. **Livreur :** Scanner QR avec `QRScannerModal`
3. Valider

**✅ Points à vérifier :**
- [ ] Caméra s'ouvre
- [ ] QR détecté automatiquement
- [ ] Validation réussie
- [ ] `statut` passe à `colis_recupere`
- [ ] `heure_recuperation` enregistrée
- [ ] `latitude_recuperation` sauvegardée (CRITIQUE)
- [ ] `longitude_recuperation` sauvegardée
- [ ] `pickup_confirmed_at` enregistré

**🐛 Bugs à chercher :**
- [ ] GPS récupération = null (BUG CRITIQUE pour calcul prix)
- [ ] Statut ne change pas
- [ ] QR non reconnu

---

### **TEST 7 : NAVIGATION VERS LIVRAISON**
**Profil :** Livreur

1. Après récupération, voir "Naviguer vers la livraison"
2. Vérifier ETA

**✅ Points à vérifier :**
- [ ] ETA affiché : "~X min vers la livraison"
- [ ] Distance restante calculée
- [ ] GPS du destinataire prioritaire si disponible
- [ ] Bouton "Voir le destinataire en direct" fonctionne

**🐛 Bugs à chercher :**
- [ ] ETA masqué
- [ ] GPS destinataire non synchronisé
- [ ] Navigation vers ancienne adresse

---

### **TEST 8 : SYNCHRONISATION GPS DESTINATAIRE (CRITIQUE)**
**Profil :** Destinataire + Livreur

1. **Destinataire :** Ouvrir `ClientExterneApp` ou lien de suivi
2. **Livreur :** Vérifier si GPS destinataire visible

**✅ Points à vérifier :**
- [ ] GPS destinataire synchronisé toutes les 5s
- [ ] `gps_arrivee_lat`, `gps_arrivee_lng` mis à jour
- [ ] Livreur voit "📍 Position GPS du destinataire"
- [ ] Indicateur "GPS actif" visible

**🐛 Bugs à chercher :**
- [ ] GPS destinataire = null
- [ ] Pas de mise à jour temps réel
- [ ] Livreur voit "Destination à définir"

---

### **TEST 9 : SCAN QR LIVRAISON**
**Profil :** Livreur + Destinataire

1. **Destinataire :** Ouvrir QR code de livraison
2. **Livreur :** Scanner QR
3. Valider

**✅ Points à vérifier :**
- [ ] Caméra s'ouvre
- [ ] QR détecté
- [ ] Validation réussie
- [ ] `statut` passe à `livree`
- [ ] `heure_livraison` enregistrée
- [ ] `latitude_livraison` sauvegardée
- [ ] `longitude_livraison` sauvegardée
- [ ] **Distance réelle calculée** (récupération → livraison)
- [ ] **Prix final calculé** (distance × 100)
- [ ] **Commission Silga calculée** (30%)
- [ ] **Montant livreur calculé** (70%)

**🐛 Bugs à chercher :**
- [ ] GPS livraison = null
- [ ] Distance = 0
- [ ] Prix = 0 ou null
- [ ] Commission non calculée
- [ ] Statut ne change pas

---

### **TEST 10 : RÉCAPITULATIF FINAL**
**Profils :** Livreur + Expéditeur + Destinataire + Admin

#### **Côté LIVREUR :**
1. Après scan QR livraison
2. Voir `LivraisonRecapitulatif`

**✅ Points à vérifier :**
- [ ] Distance affichée (ex: "3.2 km")
- [ ] Durée affichée (ex: "15 min")
- [ ] Prix final affiché (ex: "320 FCFA")
- [ ] Gain livreur affiché (ex: "224 FCFA")
- [ ] Commission Silga affichée (ex: "96 FCFA")
- [ ] Bouton "💰 PAYER" visible

**🐛 Bugs à chercher :**
- [ ] Distance = 0 ou null
- [ ] Prix = 0 ou undefined
- [ ] Gain = 0
- [ ] "NaN" affiché

#### **Côté EXPÉDITEUR :**
1. Ouvrir `ClientSuiviCourse`
2. Voir résumé final

**✅ Points à vérifier :**
- [ ] 3 métriques : Distance, Durée, Prix final
- [ ] Bouton "Donner ma note" (1-5 étoiles)
- [ ] Historique complet

**🐛 Bugs à chercher :**
- [ ] Zéros affichés
- [ ] "undefined" ou "null"
- [ ] Note non enregistrée

#### **Côté DESTINATAIRE :**
1. Ouvrir lien de suivi
2. Voir feedback 👍/👎

**✅ Points à vérifier :**
- [ ] Feedback simple affiché
- [ ] Bouton télécharger l'app

---

### **TEST 11 : MISE À JOUR ADMIN DASHBOARD**
**Profil :** Admin

1. Ouvrir `DashboardAdminExterne`
2. Vérifier stats

**✅ Points à vérifier :**
- [ ] Course apparaît dans "Livrées"
- [ ] CA du jour mis à jour
- [ ] Commission Silga calculée
- [ ] Livreur `montant_du_silga` mis à jour
- [ ] Livreur `courses_du_jour` incrémenté

**🐛 Bugs à chercher :**
- [ ] Course pas visible
- [ ] CA incorrect
- [ ] Commission non mise à jour

---

### **TEST 12 : SYNCHRONISATION TEMPS RÉEL**
**Profil :** Tous

1. Ouvrir 3 onglets : Livreur + Expéditeur + Admin
2. Faire une action (scan QR)
3. Vérifier mise à jour sur tous les onglets

**✅ Points à vérifier :**
- [ ] Mise à jour < 5s sur tous les onglets
- [ ] Statut synchronisé
- [ ] GPS synchronisé
- [ ] Prix synchronisé

**🐛 Bugs à chercher :**
- [ ] Délai > 10s
- [ ] Données divergentes

---

## 🎯 PRIORITÉS DE DIAGNOSTIC

### **PRIORITÉ 1 (CRITIQUE) :**
1. **GPS récupération non sauvegardé** → Prix = 0
2. **GPS livraison non sauvegardé** → Prix = 0
3. **ETA livreur masqué** → Navigation impossible
4. **GPS destinataire non synchronisé** → Livraison impossible

### **PRIORITÉ 2 (IMPORTANT) :**
1. **QR codes non générés** → Validation manuelle requise
2. **Commission non calculée** → Comptabilité fausse
3. **Statut non mis à jour** → UI incohérente

### **PRIORITÉ 3 (SECONDAIRE) :**
1. **UI bugs** (zéros, undefined)
2. **Délais synchronisation** > 5s

---

## 📊 RÉSULTATS ATTENDUS

### **Chaîne parfaite :**
- ✅ GPS départ : 12.3714, -1.5197
- ✅ GPS arrivée : 12.3800, -1.5300
- ✅ Distance estimée : 2.5 km
- ✅ Prix estimé : 250 FCFA
- ✅ GPS récupération : 12.3715, -1.5198
- ✅ GPS livraison : 12.3801, -1.5301
- ✅ Distance réelle : 2.6 km
- ✅ Prix final : 260 FCFA
- ✅ Commission Silga : 78 FCFA
- ✅ Gain livreur : 182 FCFA
- ✅ ETA visible partout
- ✅ Sync < 5s

---

## 🔧 OUTILS DE DIAGNOSTIC

1. **Page `/test-bout-en-bout`** : Test automatique
2. **Console navigateur** : Logs d'erreurs
3. **Dashboard Admin** : Voir toutes les courses
4. **Base44 Dashboard** : Entités `CourseExterne`, `Livreur`, `ClientExterne`

---

## 📝 NOTES DE TEST

Remplir après chaque test :

**Date :** ___________
**Testeur :** ___________
**Bugs trouvés :**
1. ___________
2. ___________
3. ___________

**Preuves :**
- Screenshots : ___________
- Logs console : ___________
- IDs de courses : ___________