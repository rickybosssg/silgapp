#!/bin/bash
# ============================================================
#  SILGAPP — Build Android App Bundle (.aab) pour Google Play
#  Version Name : 1.0.0 | Version Code : 1
# ============================================================

set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  SILGAPP — Build Google Play AAB v1.0.0          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── CONFIG ─────────────────────────────────────────────────
APP_ID="com.silgapp.app"
VERSION_NAME="1.0.0"
VERSION_CODE="1"
KEYSTORE_FILE="silgapp-release.keystore"
KEYSTORE_ALIAS="silgapp"
KEYSTORE_PASSWORD="silgapp2024secure"
AAB_OUTPUT="app/build/outputs/bundle/release/app-release.aab"

# ─── ÉTAPE 1 : Vérification de l'environnement ──────────────
echo "🔍 Étape 1/7 : Vérification environnement..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js non installé"; exit 1
fi
if ! command -v npx &> /dev/null; then
  echo "❌ npx non disponible"; exit 1
fi

echo "   ✅ Node $(node --version)"
echo "   ✅ NPM $(npm --version)"
echo ""

# ─── ÉTAPE 2 : Nettoyage ────────────────────────────────────
echo "🧹 Étape 2/7 : Nettoyage..."
rm -rf dist
echo "   ✅ Ancien dist supprimé"
echo ""

# ─── ÉTAPE 3 : Build web ────────────────────────────────────
echo "🌐 Étape 3/7 : Build web (Vite)..."
npm run build
if [ ! -d "dist" ]; then
  echo "❌ Build web échoué — dossier dist absent"; exit 1
fi
echo "   ✅ Build web OK"
echo ""

# ─── ÉTAPE 4 : Sync Capacitor ───────────────────────────────
echo "📱 Étape 4/7 : Sync Capacitor Android..."
npx cap sync android
echo "   ✅ Sync Capacitor OK"
echo ""

# ─── ÉTAPE 5 : Mise à jour versionName/versionCode ─────────
echo "📝 Étape 5/7 : Mise à jour version Android..."

BUILD_GRADLE="android/app/build.gradle"
if [ -f "$BUILD_GRADLE" ]; then
  # Mettre à jour versionCode
  sed -i.bak "s/versionCode [0-9]*/versionCode $VERSION_CODE/" "$BUILD_GRADLE"
  # Mettre à jour versionName
  sed -i.bak "s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" "$BUILD_GRADLE"
  # applicationId
  sed -i.bak "s/applicationId \"[^\"]*\"/applicationId \"$APP_ID\"/" "$BUILD_GRADLE"
  echo "   ✅ versionName=$VERSION_NAME, versionCode=$VERSION_CODE"
else
  echo "   ⚠️  build.gradle non trouvé — vérifier le dossier android/"
fi
echo ""

# ─── ÉTAPE 6 : Génération du Keystore (si absent) ───────────
echo "🔐 Étape 6/7 : Génération du keystore de signature..."

if [ ! -f "$KEYSTORE_FILE" ]; then
  echo "   Génération d'un nouveau keystore..."
  keytool -genkeypair \
    -v \
    -storetype PKCS12 \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KEYSTORE_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEYSTORE_PASSWORD" \
    -dname "CN=SILGAPP, OU=Mobile, O=SILGAPP Burkina Faso, L=Ouagadougou, ST=Centre, C=BF" \
    2>/dev/null || true
  echo "   ✅ Keystore généré : $KEYSTORE_FILE"
  echo ""
  echo "   ⚠️  IMPORTANT : Sauvegardez ce fichier keystore en lieu sûr !"
  echo "   ⚠️  Mot de passe : $KEYSTORE_PASSWORD"
else
  echo "   ✅ Keystore existant trouvé"
fi
echo ""

# ─── ÉTAPE 7 : Build AAB Release ─────────────────────────────
echo "📦 Étape 7/7 : Build Android App Bundle (AAB)..."

cd android

# Copier le keystore dans android/
cp "../$KEYSTORE_FILE" "./$KEYSTORE_FILE" 2>/dev/null || true

# Configurer la signature dans gradle.properties
PROPS_FILE="gradle.properties"
cat >> "$PROPS_FILE" << EOF

# SILGAPP Release Signing
MYAPP_RELEASE_STORE_FILE=$KEYSTORE_FILE
MYAPP_RELEASE_KEY_ALIAS=$KEYSTORE_ALIAS
MYAPP_RELEASE_STORE_PASSWORD=$KEYSTORE_PASSWORD
MYAPP_RELEASE_KEY_PASSWORD=$KEYSTORE_PASSWORD
EOF

# Clean + Bundle Release
./gradlew clean
./gradlew bundleRelease \
  -Pandroid.injected.signing.store.file="$KEYSTORE_FILE" \
  -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$KEYSTORE_ALIAS" \
  -Pandroid.injected.signing.key.password="$KEYSTORE_PASSWORD"

cd ..

# ─── RÉSULTAT ────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"

if [ -f "android/$AAB_OUTPUT" ]; then
  AAB_SIZE=$(du -h "android/$AAB_OUTPUT" | cut -f1)
  echo "║  ✅ BUILD RÉUSSI !                                ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  echo "📦 Fichier AAB généré :"
  echo "   📍 Chemin : android/$AAB_OUTPUT"
  echo "   📊 Taille : $AAB_SIZE"
  echo ""
  echo "📤 Prochaine étape — Google Play Console :"
  echo "   1. Ouvrir https://play.google.com/console"
  echo "   2. Créer une nouvelle app ou ouvrir SILGAPP"
  echo "   3. Production → Créer une version"
  echo "   4. Uploader le fichier .aab"
  echo "   5. Remplir les informations (versionName: $VERSION_NAME)"
  echo "   6. Soumettre pour review"
  echo ""
  echo "🔐 Keystore sauvegardé : $KEYSTORE_FILE"
  echo "   ⚠️  NE JAMAIS PERDRE CE FICHIER !"
else
  echo "║  ❌ BUILD ÉCHOUÉ                                  ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  echo "🔍 Vérifier les logs Gradle ci-dessus pour l'erreur"
  exit 1
fi