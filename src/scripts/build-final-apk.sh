#!/bin/bash

# 🚀 BUILD FINAL APK - SILGAPP 2
# Nettoyage complet + build + installation

set -e

echo "========================================="
echo "🔧 BUILD FINAL APK - SILGAPP 2"
echo "========================================="
echo ""

# 1. Nettoyage complet
echo "🧹 1. Nettoyage complet..."
rm -rf android/app/build
rm -rf node_modules/.vite
rm -rf dist
echo "✅ Nettoyage terminé"
echo ""

# 2. Build Vite
echo "📦 2. Build Vite..."
npm run build
echo "✅ Build Vite terminé"
echo ""

# 3. Sync Capacitor
echo "🔄 3. Sync Capacitor..."
npx cap sync android
echo "✅ Sync Capacitor terminé"
echo ""

# 4. Clean Gradle
echo "🧹 4. Clean Gradle..."
cd android
./gradlew clean
echo "✅ Clean Gradle terminé"
echo ""

# 5. Build APK Debug
echo "🏗️ 5. Build APK Debug..."
./gradlew assembleDebug
echo "✅ APK Debug générée"
echo ""

# 6. Vérification APK
echo "📋 6. Vérification APK..."
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    APK_SIZE=$(ls -lh app/build/outputs/apk/debug/app-debug.apk | awk '{print $5}')
    APK_DATE=$(ls -l app/build/outputs/apk/debug/app-debug.apk | awk '{print $6, $7, $8}')
    echo "✅ APK trouvée: $APK_SIZE ($APK_DATE)"
else
    echo "❌ APK non trouvée!"
    exit 1
fi
echo ""

# 7. Désinstallation ancienne APK
echo "📱 7. Désinstallation ancienne APK..."
adb uninstall com.silgapp2.app || echo "⚠️ APK déjà désinstallée"
echo "✅ Désinstallation terminée"
echo ""

# 8. Installation nouvelle APK
echo "📲 8. Installation nouvelle APK..."
adb install -r app/build/outputs/apk/debug/app-debug.apk
echo "✅ Installation terminée"
echo ""

# 9. Lancement app
echo "🚀 9. Lancement application..."
adb shell am start -n com.silgapp2.app/.MainActivity
echo "✅ Application lancée"
echo ""

echo "========================================="
echo "✅ BUILD ET INSTALLATION TERMINÉS"
echo "========================================="
echo ""
echo "📱 APK installée: com.silgapp2.app"
echo "📍 Location: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "🧪 PROCHAINES ÉTAPES (À FAIRE MANUELLEMENT):"
echo "1. Ouvrir l'APK sur votre appareil Android"
echo "2. Tester connexion admin (admin / <PIN>)"
echo "3. Tester connexion livreur (LVR-TES666)"
echo "4. Vérifier dashboard livreur"
echo "5. Fermer/réouvrir APK (persistance)"
echo "6. Aller sur /diagnostic-complet"
echo "7. Exécuter les 4 tests"
echo ""
echo "📊 LOGS EN TEMPS RÉEL:"
echo "adb logcat | grep -E 'findLivreurByCode|CodeIdentificationAuth|CapacitorStorage|DIAGNOSTIC|NativeLivreur'"
echo ""