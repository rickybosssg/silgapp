# Guide Build Android Local — Identique à l'APK Base44

## Pourquoi l'APK local ne fonctionne pas

### Cause 1 : `server.url` dans `capacitor.config.json` ⚠️ CRITIQUE
Le fichier `capacitor.config.json` actuel contient :
```json
"server": { "url": "https://silga-dispatch-go.base44.app" }
```

**Avec `server.url`** : La WebView Android charge le site distant. Le token OAuth (`?access_token=`) arrive sur le serveur Base44, pas dans la WebView → perdu → déconnexion silencieuse.

**Sans `server.url`** (build Base44 officiel) : La WebView charge les fichiers JS embarqués localement dans l'APK. Le token arrive dans la WebView → `index.html` le capture → SDK initialisé → connexion OK.

### Cause 2 : SHA-1 du certificat de signature non enregistré dans Google Cloud
L'APK Base44 est signé avec le certificat de Base44 (SHA-1 enregistré dans Google Cloud Console).
Votre keystore local (`release-key.keystore`) a un SHA-1 différent → Google Sign-In refuse silencieusement.

### Cause 3 : Variables d'environnement `VITE_*` manquantes
Base44 injecte automatiquement les variables `VITE_*` dans le build.
Localement, elles doivent être dans `.env.production`.

### Cause 4 : `google-services.json` manquant ou obsolète
Base44 injecte le fichier depuis le secret `GOOGLE_SERVICES_JSON`.
Localement, il doit être dans `android/app/google-services.json`.

---

## Procédure de build local correct

### Étape 1 — Créer `.env.production`
```
VITE_BASE44_APP_ID=6a0ec08f3af5e1d1284254c1
VITE_BASE44_APP_BASE_URL=https://silga-dispatch-go.base44.app
VITE_BASE44_APP_PUBLIC_URL=https://silga-dispatch-go.base44.app
VITE_BASE44_FUNCTIONS_VERSION=prod
```

### Étape 2 — Utiliser `capacitor.config.prod.json` (sans `server.url`)
```bash
# Sauvegarder la config actuelle
cp capacitor.config.json capacitor.config.dev.json

# Utiliser la config de production (sans server.url)
cp capacitor.config.prod.json capacitor.config.json
```

### Étape 3 — Vérifier `google-services.json`
Vérifiez que `android/app/google-services.json` contient le même fichier que le secret `GOOGLE_SERVICES_JSON` dans Base44.

### Étape 4 — Enregistrer le SHA-1 de votre keystore dans Google Cloud Console
```bash
# Obtenir le SHA-1 de votre keystore local
keytool -list -v \
  -keystore release-key.keystore \
  -alias silgapp \
  -storepass silgapp2024

# Copier le SHA-1 affiché et l'ajouter dans :
# Google Cloud Console → APIs & Services → Credentials
# → Votre OAuth 2.0 Client ID Android → Ajouter le SHA-1
```

### Étape 5 — Build et sync
```bash
npm run build
cp capacitor.config.prod.json capacitor.config.json   # sans server.url
npx cap sync android
```

### Étape 6 — Build Android Studio
Ouvrir `android/` dans Android Studio et générer l'APK/AAB signé avec `release-key.keystore`.

---

## Résumé des différences Base44 vs Local

| Point | APK Base44 | APK Android Studio local |
|---|---|---|
| `server.url` | **Absent** (fichiers embarqués) | **Présent** → WebView distante |
| Token OAuth | Capturé dans WebView locale | Perdu sur serveur distant |
| SHA-1 certificat | Keystore Base44 (enregistré Google) | Keystore local (non enregistré) |
| Variables VITE_* | Injectées automatiquement | Nécessite `.env.production` |
| `google-services.json` | Injecté depuis secret | Doit être en `android/app/` |

---

## Restaurer le mode développement (avec server.url)
```bash
cp capacitor.config.dev.json capacitor.config.json
```
Le `server.url` est utile en DEV pour voir les changements en live sans rebuild.
Ne JAMAIS l'inclure dans un build APK de production.