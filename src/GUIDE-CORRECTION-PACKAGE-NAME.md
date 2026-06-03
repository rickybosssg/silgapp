# 🔧 CORRECTION — Package Name Google Play

## Erreur Google Play
```
"Votre APK ou votre Android App Bundle doit porter le nom de package : com.silgapp.app"
```

## Cause probable

Le `capacitor.config.json` a bien `com.silgapp.app`, mais **le fichier `android/app/build.gradle`
peut avoir un `applicationId` différent** (ex : `com.example.app`, ou l'ancien ID).
Capacitor génère ce fichier lors de `npx cap add android` — il peut ne pas reprendre le bon ID
si le dossier `android/` a été créé avant la configuration finale.

---

## Solution en 3 commandes

```bash
# 1. Corriger tous les fichiers Android automatiquement
chmod +x scripts/fix-package-name.sh
./scripts/fix-package-name.sh

# 2. Vérifier manuellement que c'est bon
grep 'applicationId' android/app/build.gradle
# Doit afficher : applicationId "com.silgapp.app"

# 3. Générer l'AAB corrigé
./scripts/build-playstore-aab.sh
```

---

## Vérification manuelle (si le script ne suffit pas)

### Fichier 1 : `android/app/build.gradle`
```groovy
android {
    defaultConfig {
        applicationId "com.silgapp.app"   // ← VÉRIFIER CETTE LIGNE
        minSdkVersion 22
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
    }
}
```

### Fichier 2 : `android/app/build.gradle` — namespace
```groovy
android {
    namespace "com.silgapp.app"           // ← ET CETTE LIGNE
```

### Fichier 3 : `android/app/src/main/AndroidManifest.xml`
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.silgapp.app">            <!-- Peut être absent si namespace dans build.gradle -->
```

---

## Correction manuelle de build.gradle

Si le script échoue, ouvrez `android/app/build.gradle` dans un éditeur et changez :

```groovy
// AVANT (incorrect)
applicationId "com.example.app"
// ou
applicationId "io.ionic.starter"
// ou n'importe quelle autre valeur

// APRÈS (correct)
applicationId "com.silgapp.app"
```

Aussi vérifier le `namespace` :
```groovy
// AVANT
namespace "com.example.app"

// APRÈS
namespace "com.silgapp.app"
```

---

## Après correction — Rebuild complet obligatoire

```bash
# Nettoyage + rebuild
cd android
./gradlew clean
./gradlew bundleRelease \
  -Pandroid.injected.signing.store.file=silgapp-release.keystore \
  -Pandroid.injected.signing.store.password=silgapp2024secure \
  -Pandroid.injected.signing.key.alias=silgapp \
  -Pandroid.injected.signing.key.password=silgapp2024secure

# Vérifier le package name dans l'AAB généré
cd ..
java -jar bundletool.jar dump manifest \
  --bundle=android/app/build/outputs/bundle/release/app-release.aab \
  | grep package
# Doit afficher : package="com.silgapp.app"
```

---

## Vérifier l'AAB avec bundletool (optionnel)

```bash
# Télécharger bundletool
wget https://github.com/google/bundletool/releases/latest/download/bundletool-all.jar -O bundletool.jar

# Inspecter le package name dans l'AAB
java -jar bundletool.jar dump manifest \
  --bundle=android/app/build/outputs/bundle/release/app-release.aab \
  | grep "package="
```

---

## Problème de signature

Si Google Play dit "signature invalide" :

```bash
# Option 1 : Laisser Google Play signer (recommandé)
# Play Console → Configuration de l'app → Intégrité de l'app
# Activer "Signature d'application par Google Play"
# Uploader un AAB non signé → Google Play gère la signature

# Option 2 : Signer manuellement
keytool -genkeypair -v -storetype PKCS12 \
  -keystore silgapp-release.keystore \
  -alias silgapp -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass silgapp2024secure \
  -dname "CN=SILGAPP, O=SILGAPP BF, C=BF"

./gradlew bundleRelease \
  -Pandroid.injected.signing.store.file=../silgapp-release.keystore \
  -Pandroid.injected.signing.store.password=silgapp2024secure \
  -Pandroid.injected.signing.key.alias=silgapp \
  -Pandroid.injected.signing.key.password=silgapp2024secure
```

---

## Résumé

| Fichier | Ce qui doit être corrigé |
|---------|--------------------------|
| `android/app/build.gradle` | `applicationId "com.silgapp.app"` |
| `android/app/build.gradle` | `namespace "com.silgapp.app"` |
| `capacitor.config.json` | `"appId": "com.silgapp.app"` ✅ déjà correct |

**La source de vérité pour Google Play est `applicationId` dans `build.gradle`.**
Le `capacitor.config.json` seul ne suffit pas — Capacitor l'utilise pour initialiser le projet,
mais si `build.gradle` a été modifié ou généré différemment, c'est lui qui prime.