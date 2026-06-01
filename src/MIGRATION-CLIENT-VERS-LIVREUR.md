# 🚚 MIGRATION CLIENT ➜ LIVREUR EXTERNE

**Date** : 1 Juin 2026  
**Statut** : ✅ Fonctionnel

---

## 🎯 OBJECTIF

Permettre à l'administration de transformer **instantanément** un client existant en livreur externe en **un seul clic** grâce à son adresse e-mail.

---

## ⚙️ FONCTIONNEMENT

### **1. Backend Function** (`migrerClientVersLivreur.js`)

**Déclencheur** : Bouton admin "🚚 Migrer vers Livreur Externe"

**Processus** :
1. ✅ Récupérer l'email du client
2. ✅ Vérifier les doublons (si email déjà dans Livreurs Externes → erreur 409)
3. ✅ Créer automatiquement le profil livreur avec :
   - `nom`, `prénom`, `téléphone`, `email`
   - `photo` (si disponible)
   - `pays` (`country_code`)
   - `ville`, `quartier`
   - `latitude`, `longitude` (position GPS actuelle)
4. ✅ Validation automatique (`validation: "valide"`) — **pas d'attente**
5. ✅ Statut initial : `disponible` — **éligible immédiatement**
6. ✅ Génération code identification unique : `LIV{CODE_PAYS}{TIMESTAMP}`

---

## 📋 DONNÉES COPIÉES

| Champ Client | → | Champ Livreur |
|--------------|---|---------------|
| `nom` | → | `nom` |
| `prenom` | → | `prenom` |
| `telephone` | → | `telephone` |
| `user_email` | → | `user_email` |
| `country_code` | → | `country_code` |
| `ville` | → | `ville` |
| `quartier` | → | `quartier` |
| `latitude` | → | `latitude` |
| `longitude` | → | `longitude` |
| `last_seen_at` | → | `derniere_position_date` |

**Champs automatiques** :
- `reseau`: `"externe"`
- `type_livreur`: `"externe"`
- `validation`: `"valide"` ✅
- `actif`: `true`
- `statut`: `"disponible"` ✅
- `vehicule`: `"moto"` (défaut)
- `type_vehicule`: `"moto"`
- `courses_du_jour`: `0`
- `note_moyenne`: `0`
- `nombre_avis`: `0`
- `montant_du_silga`: `0`
- `code_identification`: Généré automatiquement

---

## 🛡️ SÉCURITÉ & RÈGLES

### **Anti-doublons**
```javascript
// Vérification par email avant création
if (email existe déjà dans Livreur) {
  → Erreur 409: "Déjà livreur"
  → Message: "Cet utilisateur est déjà enregistré comme livreur externe."
}
```

### **Authentification**
- **Admin uniquement** (`user.role === 'admin'`)
- Retourne 403 si non-admin

### **Email obligatoire**
- Si client sans email → migration impossible
- Message : "Client sans email - migration impossible"

---

## 🎨 INTERFACE ADMIN

### **Panel Clients Externes** (`ClientsExternesPanel.jsx`)

**Modal détail client** :
- Bouton gradient rose/rouge : **"🚚 Migrer vers Livreur Externe"**
- Visible uniquement si `!client.deja_livreur`
- Toast succès : `"✅ {prenom} {nom} est maintenant livreur externe !"`
- Toast erreur : Message d'erreur selon cas

**Boutons modal** :
```
┌─────────────────────────────────────┐
│ 🚚 Migrer vers Livreur Externe     │ ← NOUVEAU
├─────────────────────────────────────┤
│ 🔓 Débloquer  |  🔒 Bloquer        │
│ ❌ Fermer                           │
└─────────────────────────────────────┘
```

---

## 🔄 MISES À JOUR AUTOMATIQUES

Après migration réussie :

### **1. Statistiques**
- ✅ Compteur Livreurs Externes +1
- ✅ Compteur Clients Externes inchangé (client toujours présent)
- ✅ Stats admin mises à jour (ON, OFF, Libres, En course)

### **2. Liste des Livreurs**
- ✅ Nouveau livreur apparaît immédiatement
- ✅ Badge "Validé" (pas d'attente)
- ✅ Statut "Disponible" (éligible aux courses)
- ✅ Code identification affiché dans le profil

### **3. Carte Interactive**
- ✅ Livreur visible sur carte (si GPS activé)
- ✅ Code couleur : 🟢 Vert (si disponible + GPS < 5 min)
- ✅ Compteur "Libres" +1

### **4. Dispatch Automatique**
- ✅ Livreur éligible aux courses (`dispatchExterneAuto`)
- ✅ Rayon de recherche : 3-8 km
- ✅ Notifications push/WhatsApp activées

---

## 📊 EXEMPLE D'UTILISATION

### **Scenario**
1. Admin ouvre **Panel Clients Externes**
2. Recherche client par email : `jean@example.com`
3. Clique sur **👁️ Profil**
4. Clique sur **🚚 Migrer vers Livreur Externe**
5. Toast : `"✅ Jean Dupont est maintenant livreur externe !"`
6. Redirection vers **Livreurs Externes** (optionnel)
7. Nouveau livreur visible avec :
   - Badge ✅ Validé
   - Statut 🟢 Disponible
   - Code : `LIVBF123456`

---

## 🔧 CODE IDENTIFICATION

**Format** : `LIV{CODE_PAYS}{TIMESTAMP_6_CHIFFRES}`

**Exemples** :
- `LIVBF654321` (Burkina Faso)
- `LIVCI123456` (Côte d'Ivoire)
- `LIVTG789012` (Togo)

**Utilisation** :
- Connexion livreur sans email
- Recherche rapide dans l'app
- Support WhatsApp

---

## 🎯 AVANTAGES

| Avant ❌ | Après ✅ |
|----------|----------|
| Formulaire manuel à remplir | 1 clic automatique |
| Validation admin requise | Validation automatique |
| Attente activation | Éligible immédiatement |
| Risque d'erreurs de saisie | Copie automatique des données |
| Doublons possibles | Anti-doublons par email |

---

## 🧪 TESTS

### **Cas nominaux**
- ✅ Client avec email → Migration réussie
- ✅ Email unique → Livreur créé
- ✅ Stats mises à jour
- ✅ Carte mise à jour
- ✅ Dispatch inclut nouveau livreur

### **Cas d'erreur**
- ❌ Client sans email → Toast erreur
- ❌ Email déjà existant → Toast info "Déjà livreur"
- ❌ Non-admin → 403 Forbidden

---

## 📈 SUIVI & LOGS

**Logs backend** :
```
✅ Migration réussie : jean@example.com → Livreur Externe 6a1b2c3d4e5f
```

**Toast frontend** :
- Succès : `"✅ {prenom} {nom} est maintenant livreur externe !"`
- Erreur : Message selon cas

---

## 🚀 PROCHAINES ÉTAPES (Optionnel)

1. **Email de bienvenue** automatique au nouveau livreur
2. **SMS WhatsApp** avec code identification
3. **Onboarding guidé** dans l'app livreur
4. **Statistiques de migration** dans l'admin (nombre de clients migrés)
5. **Historique des migrations** (entity `MigrationHistorique`)

---

## 🔗 LIENS

- **Backend** : `functions/migrerClientVersLivreur.js`
- **Frontend** : `components/admin/ClientsExternesPanel.jsx`
- **Liste livreurs** : `pages/LivreursExternes.jsx`
- **Carte** : `pages/CarteLivreursExterne.jsx`

---

**Migration instantanée, sécurisée et sans doublons** ✅