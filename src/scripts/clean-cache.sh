#!/bin/bash
# Nettoyage complet du cache pour rebuild propre

echo " Nettoyage du cache Vite et React..."

# Supprimer les dossiers de cache
rm -rf node_modules/.vite
rm -rf dist
rm -rf build
rm -rf .vite
rm -rf node_modules/.cache

# Nettoyer le cache npm
npm cache clean --force 2>/dev/null || true

echo " Cache nettoyé !"
echo " Prêt pour un rebuild complet"
