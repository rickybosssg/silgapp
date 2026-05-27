# 🧪 PROTOCOLE TEST TERRAIN BOUT-EN-BOUT

## 🎯 OBJECTIF
Validation COMPLÈTE de toute la chaîne SILGAPP Externe en conditions RÉELLES.

---

## 📋 PRÉREQUIS

### Matériel requis
- ✅ 3 smartphones ou ordinateurs
- ✅ 1 compte Expéditeur
- ✅ 1 compte Destinataire
- ✅ 1 compte Livreur externe (actif, GPS activé)
- ✅ Connexion internet stable
- ✅ GPS activé sur tous les appareils

### Comptes requis
```
Expéditeur : vitamine637@gmail.com
Destinataire : eric.nongbzanga@yahoo.fr
Livreur : compaore.jeanjacques8@gmail.com (ou test 1)
```

---

## 🚀 DÉROULEMENT DU TEST

### PHASE 1 : CRÉATION (5 min)

#### 1.1 Expéditeur crée une course
**Appareil :** Expéditeur  
**URL :** `/client` → "Expédier un colis"

**Actions :**
1. Remplir formulaire :
   - Type : Expédier
   - Nom : "Jean Expéditeur"
   - Téléphone : +22670714588
   - Adresse départ : "Ouaga 2000"
   - GPS départ : Bouton "Utiliser GPS" → ✅
   - Adresse arrivée : "Gounougou"
   - GPS arrivée : Bouton "Utiliser GPS" → ✅
   - Destinataire : "Marie Destinataire"
   - Téléphone destinataire : +22655738247
   - Type colis : "petit_colis"
   - Notes : "TEST TERRAIN"

2. Soumettre

**✅ Vérifications :**
- [ ] Course créée avec statut "recherche_livreur"
- [ ] GPS départ : 12.38173, -1.4924972
- [ ] GPS arrivée : 12.39000, -1.50000
- [ ] Prix estimé : ~100F
- [ ] QR codes générés (pickup + delivery)

**📸 Screenshot :** Dashboard expéditeur avec course visible

---

### PHASE 2 : DISPATCH (2 min)

#### 2.1 Admin lance dispatch auto
**Appareil :** Admin  
**URL :** `/admin/externe`

**Actions :**
1. Trouver la course dans "Courses en traitement"
2. Cliquer "Dispatch auto"

**✅ Vérifications :**
- [ ] Livreur assigné dans les 60s
- [ ] `dispatch_status` = "propose"
- [ ] `livreur_id` renseigné
- [ ] Notification livreur envoyée

**📸 Screenshot :** Dashboard admin avec livreur assigné

---

### PHASE 3 : ACCEPTATION (3 min)

#### 3.1 Livreur accepte course
**Appareil :** Livreur  
**URL :** App livreur (automatique)

**Actions :**
1. Activer GPS (obligatoire)
2. Passer "En ligne"
3. Notification course reçue
4. Cliquer "Accepter"

**✅ Vérifications :**
- [ ] GPS livreur actif (`latitude`, `longitude`)
- [ ] `statut` = "livreur_en_route"
- [ ] `dispatch_status` = "accepte"
- [ ] `heure_acceptation` enregistrée
- [ ] ETA "vers récupération" affiché

**📸 Screenshot :** App livreur avec ETA affiché

---

### PHASE 4 : SYNCHRONISATION (2 min)

#### 4.1 Vérifier synchro temps réel
**Appareils :** Expéditeur + Destinataire + Livreur + Admin

**Actions :**
1. Ouvrir 4 onglets avec les 4 profils
2. Attendre 5s
3. Vérifier données identiques

**✅ Vérifications :**
- [ ] Même statut sur 4 onglets
- [ ] Même livreur affiché
- [ ] ETA expéditeur = "~X min"
- [ ] Mise à jour < 5s

**📸 Screenshot :** 4 onglets côte à côte

---

### PHASE 5 : NAVIGATION RÉCUPÉRATION (5 min)

#### 5.1 Livreur navigue vers récupération
**Appareil :** Livreur

**Actions :**
1. Cliquer "Naviguer vers la récupération"
2. Google Maps/Waze s'ouvre
3. Suivre itinéraire
4. Arriver chez expéditeur

**✅ Vérifications :**
- [ ] ETA se met à jour toutes les 5s
- [ ] Distance diminue progressivement
- [ ] Boutons Google Maps + Waze fonctionnent
- [ ] GPS livreur temps réel actif

**📸 Screenshot :** Navigation avec ETA

---

### PHASE 6 : SCAN QR RÉCUPÉRATION (2 min)

#### 6.1 Expéditeur montre QR
**Appareil :** Expéditeur  
**URL :** `/client/suivi`

**Actions :**
1. Ouvrir suivi course
2. QR code de récupération visible

**✅ Vérifications :**
- [ ] QR code affiché
- [ ] Code PIN 4 chiffres visible
- [ ] Bouton copier code fonctionne

**📸 Screenshot :** QR code récupération

#### 6.2 Livreur scanne QR
**Appareil :** Livreur

**Actions :**
1. Ouvrir modal scan QR
2. Scanner QR code expéditeur
3. Validation automatique

**✅ Vérifications :**
- [ ] Caméra s'ouvre
- [ ] QR détecté automatiquement
- [ ] `statut` = "colis_recupere"
- [ ] `heure_recuperation` enregistrée
- [ ] `latitude_recuperation` capturée
- [ ] `longitude_recuperation` capturée
- [ ] ETA "vers livraison" affiché

**📸 Screenshot :** Modal scan + validation réussie

---

### PHASE 7 : NAVIGATION LIVRAISON (5 min)

#### 7.1 Livreur navigue vers livraison
**Appareil :** Livreur

**Actions :**
1. Cliquer "Naviguer vers la livraison"
2. Google Maps/Waze s'ouvre
3. Suivre itinéraire
4. Arriver chez destinataire

**✅ Vérifications :**
- [ ] ETA se met à jour toutes les 5s
- [ ] GPS destinataire synchronisé (si existe)
- [ ] "Destination à définir" disparaît si GPS reçu
- [ ] Bouton "Voir destinataire en direct" fonctionne

**📸 Screenshot :** Navigation vers livraison

---

### PHASE 8 : SCAN QR LIVRAISON (2 min)

#### 8.1 Destinataire montre QR
**Appareil :** Destinataire  
**URL :** `/client/suivi` ou lien public

**Actions :**
1. Ouvrir suivi course
2. QR code de livraison visible

**✅ Vérifications :**
- [ ] QR code affiché
- [ ] Code PIN 4 chiffres visible
- [ ] Bouton copier code fonctionne

**📸 Screenshot :** QR code livraison

#### 8.2 Livreur scanne QR
**Appareil :** Livreur

**Actions :**
1. Ouvrir modal scan QR
2. Scanner QR code destinataire
3. Validation automatique

**✅ Vérifications :**
- [ ] Caméra s'ouvre
- [ ] QR détecté automatiquement
- [ ] `statut` = "livree"
- [ ] `heure_livraison` enregistrée
- [ ] `latitude_livraison` capturée
- [ ] `longitude_livraison` capturée
- [ ] Distance réelle calculée
- [ ] Prix final calculé (distance × 100)
- [ ] Commission Silga = 30%
- [ ] Montant livreur = 70%

**📸 Screenshot :** Modal scan + validation réussie

---

### PHASE 9 : RÉCAPITULATIF (2 min)

#### 9.1 Livreur voit récapitulatif
**Appareil :** Livreur

**Actions :**
1. Modal `LivraisonRecapitulatif` s'ouvre automatiquement
2. Vérifier données

**✅ Vérifications :**
- [ ] Distance affichée (ex: "1.2 km")
- [ ] Durée affichée (ex: "8 min")
- [ ] Prix final affiché (ex: "120 FCFA")
- [ ] Gain livreur affiché (ex: "84 FCFA")
- [ ] Commission Silga affichée (ex: "36 FCFA")
- [ ] Bouton "💰 PAYER" visible et énorme

**📸 Screenshot :** Récapitulatif avec 3 métriques

#### 9.2 Livreur clique PAYER
**Appareil :** Livreur

**Actions :**
1. Cliquer "💰 PAYER"
2. Modal se ferme

**✅ Vérifications :**
- [ ] `statut_paiement_livreur` = "paye"
- [ ] `montant_du_silga` mis à jour
- [ ] `courses_du_jour` incrémenté
- [ ] Livreur retourne à "disponible"

**📸 Screenshot :** Livreur disponible

---

### PHASE 10 : EXPÉDITEUR (2 min)

#### 10.1 Expéditeur voit résumé
**Appareil :** Expéditeur  
**URL :** `/client/suivi`

**Actions :**
1. Ouvrir suivi course
2. Voir résumé final

**✅ Vérifications :**
- [ ] 3 métriques : Distance, Durée, Prix final
- [ ] Bouton "Donner ma note" (1-5 étoiles)
- [ ] Historique complet
- [ ] Aucun "0", "NaN", "null" affiché

**📸 Screenshot :** Résumé expéditeur

#### 10.2 Expéditeur donne note
**Appareil :** Expéditeur

**Actions :**
1. Cliquer "Donner ma note"
2. Donner 5 étoiles
3. Laisser commentaire
4. Soumettre

**✅ Vérifications :**
- [ ] `note_livreur` = 5
- [ ] `commentaire_livreur` enregistré
- [ ] `note_date` enregistrée
- [ ] Livreur `note_moyenne` mise à jour
- [ ] Livreur `nombre_avis` incrémenté

**📸 Screenshot :** Note 5 étoiles

---

### PHASE 11 : DESTINATAIRE (2 min)

#### 11.1 Destinataire voit feedback
**Appareil :** Destinataire  
**URL :** `/client/suivi` ou lien public

**Actions :**
1. Ouvrir suivi course
2. Voir feedback 👍/👎

**✅ Vérifications :**
- [ ] Boutons 👍 / 👎 visibles
- [ ] Feedback enregistré
- [ ] `destinataire_feedback` = "bon" ou "mauvais"
- [ ] `destinataire_feedback_date` enregistrée

**📸 Screenshot :** Feedback destinataire

---

### PHASE 12 : ADMIN (2 min)

#### 12.1 Admin voit dashboard mis à jour
**Appareil :** Admin  
**URL :** `/admin/externe`

**Actions :**
1. Ouvrir dashboard
2. Vérifier stats

**✅ Vérifications :**
- [ ] Course dans "Livrées"
- [ ] CA du jour mis à jour
- [ ] Commission Silga calculée
- [ ] Livreur `montant_du_silga` mis à jour
- [ ] Livreur `courses_du_jour` = +1

**📸 Screenshot :** Dashboard admin avec stats

---

## 📊 CHECKLIST FINALE

### Données critiques (20 points)
- [ ] 1. Course créée avec GPS complet
- [ ] 2. Dispatch auto < 60s
- [ ] 3. Livreur accepte
- [ ] 4. ETA expéditeur affiché
- [ ] 5. ETA destinataire affiché
- [ ] 6. GPS récupération capturé
- [ ] 7. GPS livraison capturé
- [ ] 8. Navigation livreur fonctionne
- [ ] 9. QR récupération scanné
- [ ] 10. QR livraison scanné
- [ ] 11. Historique complet
- [ ] 12. Distance réelle calculée
- [ ] 13. Durée réelle calculée
- [ ] 14. Prix final = distance × 100
- [ ] 15. Récapitulatif affiché
- [ ] 16. Bouton PAYER visible
- [ ] 17. Fermeture correcte
- [ ] 18. Multi-appareils synchronisés
- [ ] 19. MAJ temps réel < 5s
- [ ] 20. Aucun "0", "NaN", "null", "1km"

### Logs requis
- [ ] Logs exportés (JSON)
- [ ] Screenshots pris (20+)
- [ ] Timestamps précis
- [ ] Erreurs documentées

---

## 🚨 GESTION D'ERREURS

### Si un élément échoue :
1. **Screenshot immédiat** de l'erreur
2. **Logs console** (F12 → Console)
3. **ID course** noté
4. **Étape exacte** documentée
5. **Correction immédiate** avant continuation

### Exemples d'erreurs :
- ❌ "GPS non capturé" → Vérifier permissions GPS
- ❌ "QR non reconnu" → Vérifier tokens générés
- ❌ "Prix = 0" → Corriger fallback 1km
- ❌ "ETA masqué" → Vérifier distance > 0
- ❌ "Sync > 5s" → Vérifier polling

---

## ✅ VALIDATION FINALE

### Si 20/20 ✅ :
**Statut :** 🎉 **CHAÎNE SILGAPP TOTALEMENT STABLE**

### Si < 20/20 :
**Statut :** 🔧 **CORRECTIONS REQUISES**
- Lister erreurs
- Corriger une par une
- Re-tester intégralement

---

**Date :** 27 mai 2026  
**Testeurs :** Expéditeur + Destinataire + Livreur + Admin  
**Durée estimée :** 30-40 minutes  
**URL test :** `/test-terrain