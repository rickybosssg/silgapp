#!/bin/bash

#  BUILD RAPIDE APK - SILGAPP 2
# Version rapide (sans clean complet)

set -e

echo " BUILD RAPIDE APK - SILGAPP 2"
echo "================================"
echo ""

# 1. Build Vite
echo " 1. Build Vite..."
npm run build
echo " Build Vite terminé"
echo ""

# 2. Sync Capacitor
echo " 2. Sync Capacitor..."
npx cap sync android
echo " Sync Capacitor terminé"
echo ""

# 3. Build APK
echo " 3. Build APK Debug..."
cd android
./gradlew assembleDebug
echo " APK Debug générée"
echo ""

# 4. Vérification
echo " 4. Vérification APK..."
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    APK_SIZE=$(ls -lh app/build/outputs/apk/debug/app-debug.apk | awk '{print $5}')
    echo " APK trouvée: $APK_SIZE"
else
    echo " APK non trouvée!"
    exit 1
fi
echo ""

# 5. Installation
echo " 5. Installation APK..."
adb uninstall com.silgapp2.app || echo " Déjà désinstallée"
adb install -r app/build/outputs/apk/debug/app-debug.apk
echo " APK installée"
echo ""

# 6. Lancement
echo " 6. Lancement application..."
adb shell am start -n com.silgapp2.app/.MainActivity
echo " Application lancée"
echo ""

echo "================================"
echo " BUILD TERMINÉ"
echo "================================"
echo ""
echo " Tester dans l'APK:"
echo "1. Connexion admin"
echo "2. Connexion livreur (LVR-TES666)"
echo "3. Dashboard livreur"
echo "4. Fermer/réouvrir (persistance)"
echo "5. /diagnostic-complet (4 tests)"
echo ""
echo " Logs: adb logcat | grep -E 'findLivreurByCode|CodeIdentificationAuth|CapacitorStorage|DIAGNOSTIC'"
echo ""
