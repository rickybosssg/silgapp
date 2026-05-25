#!/bin/bash
# 🧹 Nettoyage complet du cache pour rebuild propre SILGAPP

set -e

echo "🧹 Nettoyage du cache Vite et React..."

# Supprimer les dossiers de cache
echo "📁 Suppression node_modules/.vite..."
rm -rf node_modules/.vite

echo "📁 Suppression dist/..."
rm -rf dist

echo "📁 Suppression build/..."
rm -rf build

echo "📁 Suppression .vite..."
rm -rf .vite

echo "📁 Suppression node_modules/.cache..."
rm -rf node_modules/.cache

# Nettoyer le cache npm
echo "📦 Nettoyage cache npm..."
npm cache clean --force 2>/dev/null || echo "⚠️  npm cache clean skipped"

# Nettoyer Capacitor
echo "📱 Nettoyage Capacitor..."
rm -rf android/app/build 2>/dev/null || true

echo ""
echo "✅ Cache nettoyé avec succès !"
echo ""
echo "📦 Prêt pour un rebuild complet"
echo ""
echo "🚀 Prochaines étapes :"
echo "   1. npm run build"
echo "   2. adb uninstall com.silgapp2.app"
echo "   3. adb install dist/android/app/build/outputs/apk/release/app-release.apk"
echo ""