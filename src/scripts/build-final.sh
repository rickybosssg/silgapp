#!/bin/bash

# Script final de build APK Android - SILGAPP 2
# Après correction du problème nativeLivreurApi.js

set -e  # Arrêter en cas d'erreur

echo " Build APK Android - SILGAPP 2"
echo "================================"
echo ""
echo " Correction appliquée : lib/nativeLivreurApi.js"
echo "   - Appel correct de nativeLivreur au lieu de getNotificationStats"
echo ""

# Étape 1 : Build web
echo " Étape 1/5: Build web..."
npm run build
echo " Build web terminé"
echo ""

# Étape 2 : Sync Capacitor
echo " Étape 2/5: Sync Capacitor Android..."
npx cap sync android
echo " Sync Capacitor terminée"
echo ""

# Étape 3 : Clean Gradle
echo " Étape 3/5: Clean Gradle..."
cd android
./gradlew clean
echo " Clean Gradle terminé"
echo ""

# Étape 4 : Build APK
echo "️  Étape 4/5: Build APK Debug..."
./gradlew assembleDebug
echo " Build APK terminé"
echo ""

# Étape 5 : Vérification
echo " Étape 5/5: Vérification..."
cd ..
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    BUILD_DATE=$(date -r "$APK_PATH" "+%Y-%m-%d %H:%M:%S")

    echo ""
    echo " BUILD RÉUSSI !"
    echo ""
    echo " Informations APK :"
    echo "   Taille: $APK_SIZE"
    echo "   Date: $BUILD_DATE"
    echo "   Chemin: $APK_PATH"
    echo ""
    echo " Installation :"
    echo "   1. adb uninstall com.silgapp2.app"
    echo "   2. adb install $APK_PATH"
    echo ""
    echo " Test de validation :"
    echo "   Code: LVR-TES666"
    echo "   Livreur: TEST 2"
    echo "   Statut: Valide, Disponible"
    echo ""
    echo "️  IMPORTANT : Désinstaller l'ancienne APK avant d'installer la nouvelle !"
else
    echo " APK non trouvée"
    exit 1
fi
