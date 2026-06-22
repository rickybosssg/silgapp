#!/bin/bash
# ============================================================
#  SILGAPP — Correction du package name Android
#  Cible : com.silgapp.app (requis par Google Play)
# ============================================================

set -e

CORRECT_APP_ID="com.silgapp.app"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  SILGAPP — Fix Package Name Android              ║"
echo "║  Cible : com.silgapp.app                         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── 1. Vérifier capacitor.config.json ───────────────────────
echo " 1. Vérification capacitor.config.json..."
if grep -q '"appId": "com.silgapp.app"' capacitor.config.json; then
  echo "    capacitor.config.json OK → com.silgapp.app"
else
  echo "    capacitor.config.json incorrect ! Correction..."
  # Backup et correction
  cp capacitor.config.json capacitor.config.json.bak
  # Remplacer le appId
  sed -i 's/"appId": "[^"]*"/"appId": "com.silgapp.app"/' capacitor.config.json
  echo "    Corrigé"
fi
echo ""

# ─── 2. Vérifier android/app/build.gradle ────────────────────
BUILD_GRADLE="android/app/build.gradle"
echo " 2. Vérification $BUILD_GRADLE..."

if [ ! -f "$BUILD_GRADLE" ]; then
  echo "   ️  build.gradle non trouvé. Lancer d'abord : npx cap add android"
  echo "   → Continuez avec l'étape de sync ci-dessous"
else
  CURRENT_ID=$(grep 'applicationId' "$BUILD_GRADLE" | head -1 | sed 's/.*"\(.*\)".*/\1/' | tr -d '[:space:]')
  echo "   applicationId actuel : $CURRENT_ID"

  if [ "$CURRENT_ID" = "$CORRECT_APP_ID" ]; then
    echo "    applicationId OK → $CORRECT_APP_ID"
  else
    echo "    applicationId INCORRECT : $CURRENT_ID"
    echo "    Correction en cours..."
    cp "$BUILD_GRADLE" "${BUILD_GRADLE}.bak"
    sed -i "s/applicationId \"[^\"]*\"/applicationId \"$CORRECT_APP_ID\"/" "$BUILD_GRADLE"
    echo "    Corrigé → $CORRECT_APP_ID"
  fi
fi
echo ""

# ─── 3. Vérifier AndroidManifest.xml ─────────────────────────
MANIFEST="android/app/src/main/AndroidManifest.xml"
echo " 3. Vérification AndroidManifest.xml..."

if [ -f "$MANIFEST" ]; then
  if grep -q "com.silgapp.app" "$MANIFEST"; then
    echo "    AndroidManifest.xml OK"
  else
    echo "   ️  AndroidManifest.xml ne contient pas explicitement com.silgapp.app"
    echo "   → C'est normal : le package est défini dans build.gradle (namespace)"
  fi
else
  echo "   ️  AndroidManifest.xml non trouvé — android/ pas encore initialisé"
fi
echo ""

# ─── 4. Vérifier strings.xml (app_name) ──────────────────────
STRINGS="android/app/src/main/res/values/strings.xml"
echo " 4. Vérification strings.xml (app_name)..."

if [ -f "$STRINGS" ]; then
  APP_NAME=$(grep 'app_name' "$STRINGS" | sed 's/.*>\(.*\)<.*/\1/')
  echo "   app_name actuel : $APP_NAME"
  if [ "$APP_NAME" = "SILGAPP" ]; then
    echo "    app_name OK"
  else
    echo "    Correction app_name → SILGAPP"
    sed -i 's/<string name="app_name">.*<\/string>/<string name="app_name">SILGAPP<\/string>/' "$STRINGS"
    echo "    Corrigé"
  fi
fi
echo ""

# ─── 5. Sync Capacitor ────────────────────────────────────────
echo " 5. Re-sync Capacitor Android..."
if command -v npx &> /dev/null; then
  npx cap sync android 2>&1 | tail -5
  echo "    Sync terminé"
else
  echo "   ️  npx non disponible — lancez manuellement : npx cap sync android"
fi
echo ""

# ─── 6. Vérification finale post-sync ────────────────────────
echo " 6. Vérification finale post-sync..."
if [ -f "$BUILD_GRADLE" ]; then
  FINAL_ID=$(grep 'applicationId' "$BUILD_GRADLE" | head -1 | sed 's/.*"\(.*\)".*/\1/' | tr -d '[:space:]')
  if [ "$FINAL_ID" = "$CORRECT_APP_ID" ]; then
    echo "    applicationId FINAL confirmé : $FINAL_ID"
  else
    echo "    applicationId post-sync = $FINAL_ID (INCORRECT)"
    echo "   → Capactor a peut-être recréé le build.gradle"
    echo "   → Relancer ce script ou modifier manuellement"
  fi
fi
echo ""

echo "╔══════════════════════════════════════════════════╗"
echo "║   Vérification terminée                        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo " Étape suivante — Générer l'AAB :"
echo "   ./scripts/build-playstore-aab.sh"
echo ""
echo " Si Google Play refuse encore :"
echo "   Vérifier android/app/build.gradle ligne par ligne"
echo "   → applicationId doit être : \"com.silgapp.app\""
