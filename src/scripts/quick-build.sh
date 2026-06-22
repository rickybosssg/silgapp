#!/bin/bash

# Build rapide pour test immédiat
echo " Build rapide APK Android"
echo ""

npm run build && \
npx cap sync android && \
echo "" && \
echo " Build terminé ! APK dans : android/app/build/outputs/apk/debug/app-debug.apk" && \
echo "" && \
echo " N'oubliez pas de désinstaller l'ancienne APK :" && \
echo "   adb uninstall com.silgapp2.app"
