#!/bin/bash

echo " Démarrage du build APK Android..."
echo ""

# 1. Build web
echo " Étape 1/5: Build web..."
npm run build
if [ $? -ne 0 ]; then
    echo " Build web échoué"
    exit 1
fi
echo " Build web terminé"
echo ""

# 2. Sync Capacitor
echo " Étape 2/5: Sync Capacitor Android..."
npx cap sync android
if [ $? -ne 0 ]; then
    echo " Sync Capacitor échouée"
    exit 1
fi
echo " Sync Capacitor terminée"
echo ""

# 3. Clean Gradle
echo " Étape 3/5: Clean Gradle..."
cd android
./gradlew clean
if [ $? -ne 0 ]; then
    echo " Clean Gradle échoué"
    exit 1
fi
echo " Clean Gradle terminé"
echo ""

# 4. Build APK
echo "  Étape 4/5: Build APK Debug..."
./gradlew assembleDebug
if [ $? -ne 0 ]; then
    echo " Build APK échoué"
    exit 1
fi
echo " Build APK terminé"
echo ""

# 5. Vérification
echo " Étape 5/5: Vérification..."
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    APK_SIZE=$(du -h app/build/outputs/apk/debug/app-debug.apk | cut -f1)
    echo " APK générée avec succès"
    echo " Taille: $APK_SIZE"
    echo " Chemin: android/app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "  IMPORTANT: Désinstaller l'ancienne APK avant d'installer la nouvelle"
    echo "   adb uninstall com.base6a0ec08f3af5e1d1284254c1.app"
    echo ""
    echo " Pour installer:"
    echo "   adb install app/build/outputs/apk/debug/app-debug.apk"
else
    echo " APK non trouvée"
    exit 1
fi

cd ..
