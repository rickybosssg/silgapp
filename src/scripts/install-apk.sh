#!/bin/bash

echo "=========================================="
echo "📱 INSTALL APK SILGAPP 2"
echo "=========================================="
echo ""

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

# Check APK exists
if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK not found!"
    echo "Run ./scripts/build-stable-apk.sh first"
    exit 1
fi

echo "📦 APK found: $APK_PATH"
echo ""

# Uninstall old version
echo "🗑️  Uninstalling old version..."
adb uninstall com.silga.livraison
echo "✅ Uninstalled"
echo ""

# Install new version
echo "📲 Installing new APK..."
adb install -r "$APK_PATH"
if [ $? -eq 0 ]; then
    echo "✅ Installation successful!"
else
    echo "❌ Installation failed!"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ INSTALLATION COMPLETE!"
echo "=========================================="
echo ""
echo "🧪 TEST NOW:"
echo "   1. Open Silga app on your phone"
echo "   2. Test Admin: admin / 2468"
echo "   3. Test Livreur: LVR-TES666"
echo "   4. Close and reopen app"
echo "   5. Verify session persists"
echo ""
echo "📊 VIEW LOGS:"
echo "   adb logcat | grep -i silga"
echo ""