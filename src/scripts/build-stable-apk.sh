#!/bin/bash

echo "=========================================="
echo " BUILD APK SILGAPP 2 - VERSION STABLE"
echo "=========================================="
echo ""

# Step 1: Build web
echo " Step 1/5: npm run build..."
npm run build
if [ $? -ne 0 ]; then
    echo " Build failed!"
    exit 1
fi
echo " Build completed"
echo ""

# Step 2: Sync Capacitor
echo " Step 2/5: npx cap sync android..."
npx cap sync android
if [ $? -ne 0 ]; then
    echo " Sync failed!"
    exit 1
fi
echo " Sync completed"
echo ""

# Step 3: Navigate to android folder
echo " Step 3/5: Moving to android directory..."
cd android
echo " In android directory"
echo ""

# Step 4: Clean Gradle
echo " Step 4/5: ./gradlew clean..."
./gradlew clean
if [ $? -ne 0 ]; then
    echo " Gradle clean failed!"
    exit 1
fi
echo " Gradle clean completed"
echo ""

# Step 5: Build APK
echo "️ Step 5/5: ./gradlew assembleDebug..."
./gradlew assembleDebug
if [ $? -ne 0 ]; then
    echo " APK build failed!"
    exit 1
fi
echo " APK build completed"
echo ""

echo "=========================================="
echo " BUILD SUCCESSFUL!"
echo "=========================================="
echo ""
echo " APK location:"
echo "   android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo " INSTALLATION INSTRUCTIONS:"
echo "   1. Uninstall old APK from phone"
echo "   2. Install new APK: adb install -r app/build/outputs/apk/debug/app-debug.apk"
echo "   3. Test admin login"
echo "   4. Test livreur login (code LVR-TES666)"
echo "   5. Test close/reopen app"
echo ""
echo "=========================================="
