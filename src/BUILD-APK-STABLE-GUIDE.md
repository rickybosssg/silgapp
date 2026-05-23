========================================
BUILD APK SILGAPP 2 - GUIDE COMPLET
========================================

VERSION STABLE - Admin & Livreur fonctionnent ✅

PROCÉDURE DE BUILD (exécutée) :
1. ✅ npm run build
2. ✅ npx cap sync android
3. ✅ cd android
4. ✅ ./gradlew clean
5. ✅ ./gradlew assembleDebug

FICHIER APK GÉNÉRÉ :
📱 android/app/build/outputs/apk/debug/app-debug.apk

INSTALLATION MANUELLE :
========================

1. COPIER L'APK SUR VOTRE ORDINATEUR :
   - Depuis le terminal : 
     adb pull android/app/build/outputs/apk/debug/app-debug.apk ./silgapp2-stable.apk

2. DÉSINSTALLER L'ANCIENNE APK DU TÉLÉPHONE :
   - Sur le téléphone : Paramètres → Applications → Silga → Désinstaller
   - OU via ADB : adb uninstall com.silga.livraison

3. INSTALLER LA NOUVELLE APK :
   - Transférer le fichier APK sur le téléphone
   - Ouvrir le gestionnaire de fichiers
   - Taper sur silgapp2-stable.apk
   - Autoriser l'installation
   - OU via ADB : adb install -r silgapp2-stable.apk

4. TESTS OBLIGATOIRES :
   ✅ Test 1 : Login Admin
      - Identifiant : admin
      - PIN : 2468
      - Vérifier : accès au dashboard

   ✅ Test 2 : Login Livreur
      - Code : LVR-TES666
      - Vérifier : accès à l'app livreur

   ✅ Test 3 : Fermeture/Réouverture
      - Fermer complètement l'app
      - Rouvrir l'app
      - Vérifier : session persistante

   ✅ Test 4 : Navigation
      - Admin : tester toutes les pages
      - Livreur : tester statut, courses, historique

5. SIGNAUX DE SUCCÈS :
   - ✅ Login admin fonctionne
   - ✅ Login livreur fonctionne
   - ✅ Session persiste après fermeture
   - ✅ Navigation fluide
   - ✅ Pas d'erreurs console

PROBLÈMES FRÉQUENTS :
=====================

❌ "App not installed" :
   → Désinstaller l'ancienne version d'abord

❌ "Parse error" :
   → APK corrompue, refaire le build

❌ Login livreur échoue :
   → Vérifier code LVR-TES666 dans entity Livreur

❌ Session ne persiste pas :
   → Vérifier logs : adb logcat | grep -i silga

COMMANDS ADB UTILES :
====================

# Voir les logs en temps réel
adb logcat | grep -i silga

# Voir les logs d'authentification
adb logcat | grep -E "(Auth|Login|Session)"

# Installer l'APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Désinstaller
adb uninstall com.silga.livraison

# Vérifier l'installation
adb shell pm list packages | grep silga

# Force stop l'app
adb shell am force-stop com.silga.livraison

# Effacer les données (reset complet)
adb shell pm clear com.silga.livraison

========================================
BUILD PRÊT POUR INSTALLATION
========================================