# 📲 Installation APK Android

## ⚠️ ÉTAPE CRITIQUE : Désinstaller l'ancienne version

Avant d'installer la nouvelle APK, il **FAUT** désinstaller complètement l'ancienne version pour éviter les conflits de cache.

### Méthode 1 : Via ADB (recommandé)
```bash
adb uninstall com.silgapp2.app
```

### Méthode 2 : Manuellement sur le téléphone
1. Paramètres → Applications
2. SILGAPP 2
3. Désinstaller

## 📥 Installation de la nouvelle APK

### Via ADB
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Via transfert de fichier
1. Copier l'APK sur le téléphone
2. Ouvrir le gestionnaire de fichiers
3. Toucher l'APK pour installer
4. Autoriser l'installation d'applications inconnues si demandé

## 🧪 Test de connexion

1. Ouvrir SILGAPP 2
2. Onglet "Livreur"
3. Code d'identification : **LVR-TES666**
4. Valider

### Résultat attendu
✅ Dashboard livreur s'affiche avec :
- En-tête avec nom du livreur
- Statut (Disponible/En course/Hors ligne)
- Bouton "Je suis en ligne"
- Historique des courses

### Si ça ne marche pas
1. Vérifier les logs :
```bash
adb logcat | grep -i "silga"
```

2. Inspecter via Chrome :
   - Ouvrir `chrome://inspect/#devices`
   - Sélectionner l'appareil
   - Inspecter la WebView

3. Vérifier la connexion internet
4. Redémarrer l'application complètement

## 🐛 Debugging

### Activer le debug USB
1. Paramètres → À propos du téléphone
2. Appuyer 7 fois sur "Numéro de build"
3. Retour → Options de développement
4. Activer "Débogage USB"

### Voir les logs en temps réel
```bash
adb logcat -s silga
```

### Nettoyer le cache de l'application
```bash
adb shell pm clear com.silgapp2.app
``