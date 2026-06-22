#!/bin/bash

#  BUILD APK CORRECTIVE - SILGAPP 2
# Corrige le bug "Cannot access before initialization"

set -e

echo "========================================="
echo " BUILD APK CORRECTIVE - SILGAPP 2"
echo "========================================="
echo ""

# 1. Nettoyage complet
echo " 1. Nettoyage complet..."
rm -rf android/app/build
rm -rf node_modules/.vite
rm -rf dist
echo " Nettoyage terminé"
echo ""

# 2. Build Vite
echo " 2. Build Vite..."
npm run build
echo " Build Vite terminé"
echo ""

# 3. Sync Capacitor
echo " 3. Sync Capacitor..."
npx cap sync android
echo " Sync Capacitor terminé"
echo ""

# 4. Clean Gradle
echo " 4. Clean Gradle..."
cd android
./gradlew clean
echo " Clean Gradle terminé"
echo ""

# 5. Build APK Debug
echo "️ 5. Build APK Debug..."
./gradlew assembleDebug
echo " APK Debug générée"
echo ""

# 6. Vérification APK
echo " 6. Vérification APK..."
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    APK_SIZE=$(ls -lh app/build/outputs/apk/debug/app-debug.apk | awk '{print $5}')
    APK_DATE=$(ls -l app/build/outputs/apk/debug/app-debug.apk | awk '{print $6, $7, $8}')
    echo " APK trouvée: $APK_SIZE ($APK_DATE)"
    echo ""
    echo " Fichier: android/app/build/outputs/apk/debug/app-debug.apk"
else
    echo " APK non trouvée!"
    exit 1
fi
echo ""

echo "========================================="
echo " BUILD TERMINÉ"
echo "========================================="
echo ""
echo " INSTRUCTIONS POUR ERIC :"
echo "1. Désinstaller l'ancienne APK du téléphone"
echo "2. Redémarrer le téléphone"
echo "3. Installer la nouvelle APK"
echo "4. Se connecter avec eric.nongbzanga@yahoo.fr"
echo ""
