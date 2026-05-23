# 🔍 Diagnostic Divergence Preview vs APK

## Problème identifié

**Symptôme :**
- Preview : Liste des livreurs créée et visible
- APK Admin : Affiche **0 livreur**

**Conséquence :**
- Aucun code livreur ne peut fonctionner
- La synchronisation retourne 0 livreurs
- Les livreurs ne peuvent pas se connecter

## Hypothèses

### 1. **Environnements Base44 différents** ⚠️
Le preview et l'APK pourraient pointer vers :
- Des **app IDs** différents
- Des **workspaces** différents
- Des **bases de données** différentes

### 2. **Configuration APK obsolète**
L'APK pourrait utiliser :
- Un ancien `app_id` en dur dans le code
- Une ancienne URL publique
- Un ancien token d'accès

### 3. **Problème d'authentification**
L'APK admin pourrait :
- Ne pas être connecté au bon compte
- Utiliser un rôle différent (pas admin)
- Avoir un token expiré

## Solution : Page de Diagnostic Base44

J'ai créé une page **`/diagnostic-base44`** accessible depuis :
- Le Dashboard admin (bouton "Diagnostic Base44")
- Navigation directe : `https://silga-dispatch-go.base44.app/diagnostic-base44`

### Cette page affiche :

1. **Configuration Base44**
   - App ID utilisé
   - Plateforme (APK vs Web)
   - URL publique
   - Hostname

2. **Utilisateur actuel**
   - Nom et email
   - Rôle (admin/user)
   - État d'authentification

3. **Données Livreurs**
   - Nombre de livreurs trouvés
   - Liste complète avec détails
   - Codes d'identification
   - Statut (actif/inactif)

4. **Informations techniques**
   - User Agent
   - URL complète
   - Plateforme détectée

## Comment diagnostiquer

### Étape 1 : Ouvrir le diagnostic dans le **PREVIEW**

1. Se connecter en tant qu'admin (`ADMIN7777`)
2. Cliquer sur **"Diagnostic Base44"**
3. Noter les informations :
   ```
   App ID: 6a0ec08f3af5e1d1284254c1
   Plateforme: Web (Preview)
   Public URL: https://silga-dispatch-go.base44.app
   Nombre de livreurs: X
   ```

### Étape 2 : Ouvrir le diagnostic dans l'**APK**

1. Ouvrir l'APK Android
2. Se connecter en tant qu'admin (`ADMIN7777`)
3. Cliquer sur **"Diagnostic Base44"**
4. Noter les informations :
   ```
   App ID: ??? (peut être différent!)
   Plateforme: APK (Native)
   Public URL: ??? (peut être différente!)
   Nombre de livreurs: 0 (problème!)
   ```

### Étape 3 : Comparer

**Ce qu'il faut vérifier :**

| Information | Preview | APK | Doit être identique? |
|-------------|---------|-----|---------------------|
| App ID | ✅ | ❓ | **OUI** |
| Public URL | ✅ | ❓ | **OUI** |
| User email | ✅ | ❓ | **OUI** |
| User role | admin | ❓ | **OUI** |
| Nombre livreurs | X | 0 | **NON - c'est le problème!** |

## Causes possibles

### Cause 1 : App ID différent
**Si l'App ID est différent :**
- L'APK pointe vers une autre app Base44
- Solution : Rebuild l'APK avec le bon `VITE_BASE44_APP_ID`

### Cause 2 : URL publique différente
**Si l'URL publique est différente :**
- L'APK appelle un autre serveur
- Solution : Mettre à jour `VITE_BASE44_APP_PUBLIC_URL`

### Cause 3 : Même config mais 0 livreur
**Si la config est identique mais 0 livreur :**
- Problème de permissions d'accès
- L'utilisateur APK n'a pas les droits `asServiceRole`
- Solution : Vérifier l'authentification

## Fichiers à vérifier

### 1. `lib/app-params.js`
```javascript
export const BASE44_APP_ID = '6a0ec08f3af5e1d1284254c1';
export const APP_PUBLIC_URL = 'https://silga-dispatch-go.base44.app';
```

### 2. `.env` (utilisé au build)
```env
VITE_BASE44_APP_ID=6a0ec08f3af5e1d1284254c1
VITE_BASE44_APP_PUBLIC_URL=https://silga-dispatch-go.base44.app
```

### 3. `api/base44Client.js`
```javascript
const { appId, token, functionsVersion, appBaseUrl, isCapacitor } = appParams;
```

### 4. `capacitor.config.json`
```json
{
  "server": {
    "allowNavigation": [
      "silga-dispatch-go.base44.app",
      "*.base44.com"
    ]
  }
}
```

## Commandes de rebuild

### Rebuild complet avec logs
```bash
# Nettoyer
npm run clean

# Installer
npm install

# Build avec variables d'env
VITE_BASE44_APP_ID=6a0ec08f3af5e1d1284254c1 \
VITE_BASE44_APP_PUBLIC_URL=https://silga-dispatch-go.base44.app \
npm run build

# Sync Android
npx cap sync android

# Build APK
npx cap run android
```

## Solution rapide (si App ID différent)

### 1. Vérifier l'App ID actuel dans l'APK
```javascript
// Dans DiagnosticBase44, lire l'App ID affiché
```

### 2. Mettre à jour `.env.local` si nécessaire
```env
VITE_BASE44_APP_ID=<LE_BON_APP_ID>
```

### 3. Rebuild
```bash
npm run build
npx cap sync android
npx cap run android
```

## Résultat attendu

Après correction, le diagnostic APK doit afficher :

```
✅ App ID: 6a0ec08f3af5e1d1284254c1 (identique preview)
✅ Plateforme: APK (Native)
✅ Public URL: https://silga-dispatch-go.base44.app
✅ Nombre de livreurs: X (même nombre que preview)
✅ Liste des livreurs: visible
```

## Prochaines étapes

1. **Ouvrir `/diagnostic-base44` dans le preview** → Capturer les infos
2. **Ouvrir `/diagnostic-base44` dans l'APK** → Capturer les infos
3. **Comparer** les deux captures
4. **Identifier** la divergence (App ID, URL, auth)
5. **Corriger** la configuration APK
6. **Rebuild** l'APK
7. **Tester** la synchronisation des codes livreurs