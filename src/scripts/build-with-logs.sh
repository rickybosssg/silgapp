#!/bin/bash

echo "🔧 Build APK avec logs de diagnostic"
echo "====================================="
echo ""

# Build web
echo "📦 Build web..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build web échoué"
    exit 1
fi

echo "✅ Build web réussi"
echo ""

# Sync Capacitor
echo "📱 Sync Capacitor Android..."
npx cap sync android

if [ $? -ne 0 ]; then
    echo "❌ Sync Capacitor échouée"
    exit 1
fi

echo "✅ Sync réussie"
echo ""

# Clean Gradle
echo "🧹 Clean Gradle..."
cd android
./gradlew clean

if [ $? -ne 0 ]; then
    echo "❌ Clean Gradle échoué"
    exit 1
fi

echo "✅ Clean réussi"
echo ""

# Build APK
echo "⚙️  Build APK Debug..."
./gradlew assembleDebug

if [ $? -ne 0 ]; then
    echo "❌ Build APK échoué"
    exit 1
fi

echo "✅ Build APK réussi"
echo ""

# Vérification
cd ..
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    BUILD_DATE=$(date -r "$APK_PATH" "+%Y-%m-%d %H:%M:%S")
    
    echo "🎉 BUILD TERMINÉ !"
    echo ""
    echo "📊 APK :"
    echo "   Taille: $APK_SIZE"
    echo "   Date: $BUILD_DATE"
    echo "   Chemin: $APK_PATH"
    echo ""
    echo "📲 Installation :"
    echo "   1. adb uninstall com.silgapp2.app"
    echo "   2. adb install $APK_PATH"
    echo ""
    echo "🧪 Test :"
    echo "   - Ouvrir APK"
    echo "   - Aller sur /diagnostic-apk"
    echo "   - Tester code: LVR-TES666"
    echo "   - Lire les logs"
    echo ""
    echo "📖 Guide: DIAGNOSTIC-APK-GUIDE.md"
else
    echo "❌ APK non trouvée"
    exit 1
fi