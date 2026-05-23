# 📘 Synchronisation des Codes Livreurs - SILGAPP 2

## 🎯 Objectif

Permettre aux livreurs de se connecter **localement** avec leur code d'identification, sans dépendre d'un appel backend complexe au moment du login.

## 🔧 Fonctionnement

### 1. **Synchronisation (Admin)**

Quand un administrateur se connecte :
- Un bouton "Synchroniser les codes livreurs" est disponible dans le Dashboard
- La fonction `syncLivreursLocaux()` récupère TOUS les livreurs **actifs et validés** avec un `code_identification`
- Cette liste est stockée **localement** dans `Capacitor Preferences` (APK) ou `localStorage` (web)

**Données synchronisées :**
```javascript
{
  livreur_id: "abc123",
  nom: "KOUAME",
  prenom: "Jean",
  telephone: "+22670000000",
  code_identification: "LVR-TES666",
  quartier: "Ouaga 2000",
  vehicule: "moto",
  user_email: "jean.k@email.com",
  validation: "valide",
  actif: true,
  synced_at: "2024-05-23T10:30:00Z"
}
```

### 2. **Connexion Livreur (100% locale)**

Quand un livreur saisit son code :

```
Code saisi → Vérification LOCALE → Session créée → Dashboard
```

**Aucun appel backend n'est fait au moment du login !**

La vérification se fait dans le cache local :
- ✅ Code trouvé + compte actif → Connexion immédiate
- ❌ Code non trouvé → "Code incorrect"
- ⚠️ Cache vide → "Synchronisation requise"

### 3. **Architecture des fichiers**

```
lib/livreursLocaux.js          ← Cache local des livreurs
├── syncLivreursLocaux()       ← Synchronise depuis la DB
├── getLivreursLocaux()        ← Lit le cache
├── verifyCodeLocalement()     ← Vérifie un code (zéro backend)
└── isCacheValide()            ← Vérifie si cache est récent

functions/syncLivreursLocaux   ← Fonction backend (admin only)

components/admin/LivreursCacheSync  ← UI de synchronisation (Dashboard)

lib/silgappAuth.js
├── signInWithIdentificationCode() ← Utilise verifyCodeLocalement()
├── syncLivreursCodes()            ← Expose la sync au frontend
└── checkLivreursCache()           ← Vérifie l'état du cache

pages/Silgapp2Login
└── Affiche alerte si cache vide + statut du cache
```

## 📋 Utilisation

### **Pour l'administrateur :**

1. Se connecter avec `ADMIN7777`
2. Aller dans le **Dashboard**
3. Cliquer sur **"Synchroniser"** dans la carte "Synchronisation des codes livreurs"
4. ✅ Les codes de TOUS les livreurs actifs sont maintenant en cache

**Quand re-synchroniser ?**
- Après avoir créé un nouveau livreur
- Après avoir activé/désactivé un livreur
- Après avoir modifié un `code_identification`
- Si un livreur n'arrive pas à se connecter

### **Pour le livreur :**

1. Ouvrir l'application
2. Saisir son `code_identification` (ex: `LVR-TES666`)
3. Cliquer sur "Se connecter"
4. ✅ **Connexion instantanée** → Dashboard livreur

## 🚨 Gestion des erreurs

### **Cache vide**
```
Message: "Aucun code livreur enregistré. Synchronisation nécessaire."
Solution: Un admin doit synchroniser depuis le Dashboard
```

### **Code incorrect**
```
Message: "Code d'identification incorrect."
Cause: Le code n'existe pas dans le cache
Solution: Vérifier le code avec un admin
```

### **Compte non validé**
```
Message: "Compte livreur non valide. Attendez la validation de l'administrateur."
Cause: validation !== 'valide'
Solution: Admin doit valider le livreur
```

### **Compte désactivé**
```
Message: "Compte livreur desactive. Contactez l'administrateur."
Cause: actif === false
Solution: Admin doit réactiver le livreur
```

## 🔄 Synchronisation automatique

**À implémenter (optionnel) :**
- Sync auto au démarrage de l'APK (si internet)
- Sync auto après connexion admin
- Invalidation du cache après 60 minutes

## 📊 Avantages

✅ **Connexion instantanée** - zéro latence backend  
✅ **Fonctionne hors-ligne** - une fois sync, pas besoin d'internet  
✅ **Simple comme l'admin** - même logique, juste avec les codes livreurs  
✅ **Fiable** - pas de boucle infinie, pas de chargement interminable  
✅ **Debug facile** - logs clairs, statut visible  

## 🛠️ Commands utiles

**Vérifier le cache :**
```javascript
import { getLivreursLocaux } from '@/lib/livreursLocaux';
const livreurs = await getLivreursLocaux();
console.log('Livreurs en cache:', livreurs.length);
```

**Forcer une synchro :**
```javascript
import { syncLivreursLocaux } from '@/lib/livreursLocaux';
const result = await syncLivreursLocaux();
console.log('Sync:', result.count, 'livreurs');
```

**Effacer le cache :**
```javascript
import { clearLivreursCache } from '@/lib/livreursLocaux';
await clearLivreursCache();
```

## 📝 Notes techniques

- **Stockage :** Capacitor Preferences (natif) ou localStorage (web)
- **Clé de stockage :** `silgapp_livreurs_cache`
- **Taille max :** ~1000 livreurs (largement suffisant)
- **Durée de vie :** Illimitée (mais invalider après 60 min recommandé)
- **Sécurité :** Codes en MAJUSCULE, trim, validation actif/valide

## 🎯 Prochaines étapes

- [ ] Sync auto au démarrage (si internet)
- [ ] Indicateur de fraîcheur du cache (UI)
- [ ] Notification push si nouveau livreur créé
- [ ] Historique des synchronisations