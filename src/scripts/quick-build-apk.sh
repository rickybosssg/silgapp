#!/bin/bash

# Build rapide pour test immédiat
npm run build && echo "✅ Build OK" && npx cap sync android && echo "✅ Sync OK" && echo "" && echo "📱 APK prête dans android/" && echo "" && echo "Ensuite :" && echo "  cd android && ./gradlew clean && ./gradlew assembleDebug" && echo "" && echo "Puis :" && echo "  adb uninstall com.silgapp2.app" && echo "  adb install android/app/build/outputs/apk/debug/app-debug.apk"