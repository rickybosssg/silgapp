#!/bin/bash

echo "=========================================="
echo "NETTOYAGE COMPLET ANDROID - SILGAPP 2"
echo "=========================================="
echo ""

# 1. Stop all Gradle daemons
echo "[1/8] Arrêt des Gradle daemons..."
./gradlew --stop 2>/dev/null || true

# 2. Clean Gradle cache
echo "[2/8] Nettoyage cache Gradle..."
rm -rf android/.gradle
rm -rf android/app/.gradle
rm -rf android/app/build
rm -rf android/.gradle-wrapper

# 3. Clean Capacitor
echo "[3/8] Nettoyage Capacitor..."
rm -rf android/app/src/main/public
npx cap sync android --force 2>/dev/null || true

# 4. Clean node_modules (optional but recommended for fresh build)
echo "[4/8] Nettoyage node_modules..."
rm -rf node_modules
npm install

# 5. Clean build artifacts
echo "[5/8] Suppression builds précédents..."
rm -rf dist
rm -rf android/app/build/outputs/apk
rm -rf android/app/build/intermediates

# 6. Invalidate Android Studio cache
echo "[6/8] Nettoyage cache Android..."
find android -name "*.iml" -delete
find android -name ".idea" -type d -exec rm -rf {} + 2>/dev/null || true

# 7. Fresh build
echo "[7/8] Build Vite..."
npm run build

# 8. Sync Capacitor
echo "[8/8] Sync Capacitor Android..."
npx cap sync android

echo ""
echo "=========================================="
echo "✅ NETTOYAGE TERMINÉ"
echo "=========================================="
echo ""
echo "Prochaines étapes :"
echo "1. Ouvrir Android Studio : npx cap open android"
echo "2. Clean Project dans Android Studio"
echo "3. Rebuild Project"
echo "4. Run sur device"
echo ""
echo "OU utiliser le script d'installation :"
echo "./scripts/install-apk.sh"
echo ""