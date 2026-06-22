#!/bin/bash
npm run build && echo "" && echo " Build OK" && npx cap sync android && echo "" && echo " Sync OK" && echo "" && echo " APK prête. Ensuite :" && echo "  cd android && ./gradlew clean && ./gradlew assembleDebug" && echo "" && echo "Puis :" && echo "  adb uninstall com.silgapp2.app" && echo "  adb install android/app/build/outputs/apk/debug/app-debug.apk"
