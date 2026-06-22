#!/bin/bash

# Build web + sync Capacitor
echo " Build et sync pour APK Android..."
echo ""

npm run build && echo " Build OK" && npx cap sync android && echo " Sync OK" && echo "" && echo " APK prête à builder dans android/" && echo "" && echo "Ensuite :" && echo "  cd android && ./gradlew clean && ./gradlew assembleDebug"
