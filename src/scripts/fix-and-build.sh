#!/bin/bash

echo "🔧 Correction du problème APK Android"
echo "======================================"
echo ""
echo "Problème identifié : lib/nativeLivreurApi.js appelait getNotificationStats au lieu de nativeLivreur"
echo "Correction appliquée : Appel correct de la fonction nativeLivreur"
echo ""
echo "📦 Build en cours..."
echo ""

# Build web
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build web réussi"
    echo ""
    echo "📱 Sync Capacitor..."
    npx cap sync android
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Sync réussie"
        echo ""
        echo "🎉 PRÊT POUR LE BUILD APK !"
        echo ""
        echo "Prochaines étapes :"
        echo "1. cd android"
        echo "2. ./gradlew clean"
        echo "3. ./gradlew assembleDebug"
        echo ""
        echo "OU utiliser le script complet :"
        echo "./scripts/build-android.sh"
    else
        echo "❌ Sync échouée"
        exit 1
    fi
else
    echo "❌ Build web échoué"
    exit 1
fi