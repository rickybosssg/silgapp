#!/bin/bash

echo "=========================================="
echo " QUICK BUILD APK - SILGAPP 2"
echo "=========================================="
echo ""

# Build
echo " Building..."
npm run build || exit 1

# Sync
echo " Syncing..."
npx cap sync android || exit 1

# Clean & Build APK
echo " Cleaning & Building APK..."
cd android
./gradlew clean || exit 1
./gradlew assembleDebug || exit 1

echo ""
echo " BUILD COMPLETED!"
echo ""
echo " APK: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo " INSTALL:"
echo "   adb uninstall com.silga.livraison"
echo "   adb install -r app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo " TESTS:"
echo "   Admin: admin / 2468"
echo "   Livreur: LVR-TES666"
echo ""
