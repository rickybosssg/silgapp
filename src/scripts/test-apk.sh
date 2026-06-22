#!/bin/bash

echo "=========================================="
echo " TEST APK SILGAPP 2"
echo "=========================================="
echo ""

# Start logcat
echo " Starting logcat (Ctrl+C to stop)..."
echo "Watching for: Auth, Login, Session, Storage, Capacitor"
echo ""

# Run logcat with filters
adb logcat | grep -E "(silga|Auth|Login|Session|Storage|Capacitor|Livreur)"
