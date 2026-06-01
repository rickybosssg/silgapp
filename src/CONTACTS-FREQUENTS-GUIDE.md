# 📱 Contacts Fréquents + Répertoire Téléphone - SILGAPP

## Fonctionnalité complète

### Niveau 1 : Contacts fréquents SILGAPP (⭐)
- **Persistance locale** : Stockage via Capacitor Preferences
- **Apprentissage automatique** : Tri par nombre d'utilisations
- **Maximum 20 contacts** : Les plus utilisés apparaissent en premier
- **Recherche** : Filtrage par nom ou numéro de téléphone

### Niveau 2 : Import depuis le répertoire téléphonique (📱)
- **Accès natif** : Utilise l'API Contacts de Capacitor
- **Permission requise** : Demande d'autorisation au premier usage
- **Import massif** : Jusqu'à 100 contacts du téléphone
- **Ajout automatique** : Les contacts sélectionnés sont ajoutés aux favoris SILGAPP
- **Recherche** : Filtrage dans le répertoire importé

## Architecture technique

### Capacitor Plugins utilisés
```javascript
- @capacitor/preferences (déjà installé)
  → Stockage local des contacts fréquents

- @capacitor/core (déjà installé)
  → Détection plateforme native

- @capacitor/contacts (à installer)
  → Accès au répertoire téléphonique
```

### Configuration requise

#### Android (capacitor.config.json)
```json
{
  "plugins": {
    "Contacts": {
      "permissions": {
        "read": true,
        "write": false
      }
    }
  }
}
```

#### AndroidManifest.xml
```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

#### iOS (Info.plist)
```xml
<key>NSContactsUsageDescription</key>
<string>SILGAPP utilise vos contacts pour faciliter la saisie des destinataires de courses</string>
```

## Flux utilisateur

### Étape 1 : Ouverture du sélecteur
```
[Bouton "📖 Choisir un contact"]
        ↓
[Modale avec 2 onglets]
  - ⭐ Fréquents (défaut)
  - 📱 Téléphone
```

### Étape 2 : Onglet "Fréquents"
```
Affiche les contacts SILGAPP
        ↓
[Recherche optionnelle]
        ↓
[Clic sur un contact]
        ↓
[Sélection + Incrémentation compteur]
        ↓
[Remplissage formulaire]
```

### Étape 3 : Onglet "Téléphone" (natif seulement)
```
Premier accès :
[Importer depuis mon téléphone]
        ↓
[Demande permission OS]
        ↓
[Chargement répertoire]
        ↓
[Affichage 100 contacts]

Accès suivants :
[Liste contacts importés]
        ↓
[Recherche optionnelle]
        ↓
[Clic sur un contact]
        ↓
[Sélection + Ajout aux favoris SILGAPP]
        ↓
[Remplissage formulaire]
```

## Structure des données

### Contact fréquent SILGAPP
```json
{
  "nom": "Jean Ouédraogo",
  "telephone": "+226 70 00 00 00",
  "usage_count": 5,
  "last_used": "2026-06-01T12:00:00.000Z"
}
```

### Contact téléphone (importé)
```json
{
  "nom": "Marie Kaboré",
  "telephone": "+226 76 00 00 00"
}
```

## Compatibilité

| Plateforme | Contacts fréquents | Import téléphone |
|------------|-------------------|------------------|
| Android APK | ✅ Oui | ✅ Oui |
| iOS App | ✅ Oui | ✅ Oui |
| PWA Web | ✅ Oui (localStorage) | ❌ Non (API non disponible) |

## Cas d'usage

### Scénario 1 : Contact régulier (rapide)
1. Client clique "📖 Choisir un contact"
2. Onglet "⭐ Fréquents" (défaut)
3. Sélectionne "Jean" (déjà utilisé 5 fois)
4. Formulaire rempli automatiquement
5. **Compteur passe à 6**

### Scénario 2 : Nouveau contact depuis téléphone
1. Client clique "📖 Choisir un contact"
2. Bascule sur onglet "📱 Téléphone"
3. Clique "Importer depuis mon téléphone"
4. Autorise l'accès aux contacts
5. Sélectionne "Marie" dans la liste
6. Formulaire rempli automatiquement
7. **Marie ajoutée aux favoris SILGAPP**

### Scénario 3 : Recherche dans le répertoire
1. Client importe 100 contacts
2. Utilise la barre de recherche
3. Tape "Kaboré"
4. Filtre aux contacts correspondants
5. Sélectionne le bon contact

## Avantages concurrentiels

### ✅ Uber / Bolt / Yango
- Accès rapide aux contacts fréquents
- Import depuis le répertoire
- Recherche instantanée
- **Zéro saisie manuelle**

### ✅ SILGAPP (en plus)
- Compteur d'utilisations (smart ranking)
- Hybridation fréquent/téléphone
- Persistance cross-session
- **Ajout automatique aux favoris**

## Composants

### Fichiers concernés
```
components/client/ContactPicker.jsx   ← Sélecteur unifié
components/client/CourseStepForm.jsx  ← Intégration formulaire
pages/CourseExterneFormSync.jsx       ← Formulaire principal
```

### API Capacitor Contacts
```javascript
// Charger les contacts
const result = await Contacts.getContacts({
  fields: ['name', 'phones'],
});

// Résultat
{
  contacts: [
    {
      id: "1",
      name: "Jean",
      phones: [{ value: "+226 70 00 00 00", label: "Mobile" }]
    }
  ]
}
```

## Gestion des permissions

### Premier accès (Android/iOS)
```
[Clic "Importer"]
        ↓
[Dialog OS : "SILGAPP souhaite accéder..."]
  - Autoriser
  - Refuser
        ↓
[Autorisé] → Chargement contacts
        ↓
[Refusé] → Toast erreur + Message aide
```

### Permission refusée
- Toast : "Permission refusée. Autorisez dans les paramètres."
- L'onglet "Téléphone" reste accessible
- Message : "Fonctionnalité mobile uniquement"

## Évolutions possibles

- [ ] Édition des contacts fréquents (suppression)
- [ ] Tri personnalisé (ordre manuel)
- [ ] Catégorisation (Famille, Travail, etc.)
- [ ] Synchronisation cloud (backup)
- [ ] Suggestions intelligentes (contexte)
- [ ] QR Code contact (partage rapide)

## Dépannage

### Problème : "Plugin contacts non disponible"
**Solution** : Vérifier que `@capacitor/contacts` est installé dans `package.json`

### Problème : "Permission refusée"
**Solution** : 
- Android : Paramètres → Applications → SILGAPP → Autorisations → Contacts
- iOS : Réglages → SILGAPP → Activer "Contacts"

### Problème : "Aucun contact trouvé"
**Causes possibles** :
1. Répertoire téléphonique vide
2. Permission non accordée
3. Contacts stockés sur SIM (non lus par API)

## Tests recommandés

### Test 1 : Import initial
```
1. Ouvrir formulaire de course
2. Cliquer "📖 Choisir un contact"
3. Onglet "📱 Téléphone"
4. "Importer depuis mon téléphone"
5. Vérifier : 100 contacts max importés
```

### Test 2 : Ajout aux favoris
```
1. Sélectionner un contact téléphone
2. Vérifier : Formulaire rempli
3. Réouvrir sélecteur
4. Onglet "⭐ Fréquents"
5. Vérifier : Contact présent avec compteur = 1
```

### Test 3 : Recherche
```
1. Importer 50+ contacts
2. Utiliser barre de recherche
3. Taper une lettre
4. Vérifier : Filtrage instantané
```

### Test 4 : Plateforme web (PWA)
```
1. Ouvrir sur navigateur desktop
2. Cliquer "📖 Choisir un contact"
3. Onglet "📱 Téléphone"
4. Vérifier : Message "Mobile uniquement"
5. Onglet "⭐ Fréquents"
6. Vérifier : Contacts fréquents fonctionnels
```

## Notes importantes

⚠️ **Vie privée** : 
- Les contacts téléphone ne sont PAS stockés sur serveur
- Uniquement en local via Capacitor Preferences
- Aucun envoi vers API externe

⚠️ **Performance** :
- Limité à 100 contacts (évite lenteur)
- Chargement asynchrone (UI bloquante)
- Recherche côté client (instantanée)

⚠️ **Compatibilité** :
- Android 6.0+ (permissions runtime)
- iOS 13+ (privacy descriptions)
- Web : fallback vers favoris uniquement