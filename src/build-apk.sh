#!/bin/bash

# Script de build APK Android - SILGAPP 2
# À exécuter après chaque modification du code

echo "🚀 Build APK Android - SILGAPP 2"
echo "================================"

# 1. Nettoyage du build précédent
echo "📦 Nettoyage..."
rm -rf dist
rm -rf android/app/build/outputs/apk

# 2. Build web
echo "🌐 Build web..."
npm run build

# 3. Sync Capacitor
echo "📱 Sync Capacitor Android..."
npx cap sync android

# 4. Clean Gradle
echo "🧹 Clean Gradle..."
cd android
./gradlew clean

# 5. Build APK Debug
echo "⚙️ Build APK Debug..."
./gradlew assembleDebug

# 6. Résultat
echo ""
echo "✅ Build terminé !"
echo "📍 APK générée : android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "⚠️ IMPORTANT : Désinstaller l'ancienne APK avant d'installer la nouvelle"
echo "   adb uninstall com.silgapp2.app"
echo ""