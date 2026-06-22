#!/bin/bash

echo "=========================================="
echo " FULL REBUILD & INSTALL"
echo "=========================================="
echo ""

# Build
echo " Step 1: Building..."
npm run build
if [ $? -ne 0 ]; then
    echo " Build failed!"
    exit 1
fi

# Sync
echo " Step 2: Syncing..."
npx cap sync android
if [ $? -ne 0 ]; then
    echo " Sync failed!"
    exit 1
fi

# Clean & Build APK
echo " Step 3: Cleaning..."
cd android
./gradlew clean
if [ $? -ne 0 ]; then
    echo " Gradle clean failed!"
    exit 1
fi

echo " Step 4: Building APK..."
./gradlew assembleDebug
if [ $? -ne 0 ]; then
    echo " APK build failed!"
    exit 1
fi

cd ..

# Install
echo " Step 5: Installing..."
adb uninstall com.silga.livraison
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
if [ $? -ne 0 ]; then
    echo " Installation failed!"
    exit 1
fi

echo ""
echo "=========================================="
echo " FULL REBUILD & INSTALL COMPLETE!"
echo "=========================================="
echo ""
echo " TEST NOW ON YOUR PHONE:"
echo "   1. Open Silga app"
echo "   2. Login Admin: admin / 2468"
echo "   3. Login Livreur: LVR-TES666"
echo "   4. Close app completely"
echo "   5. Reopen app - session should persist"
echo ""
echo " MONITOR LOGS:"
echo "   ./scripts/test-apk.sh"
echo ""
