# 🔍 Diagnostic Complet - Bouton Batterie Faible

## ✅ Vérifications Effectuées

### 1. Un seul composant LivreurStatutCard
- **Fichier** : `components/livreur/LivreurStatutCard.jsx`
- **Statut** : ✅ CORRECT - Un seul fichier existe
- **Condition** : Ligne 59 : `!isExterne && (isDisponible || isEnCourse) && livreur`

### 2. Import correct dans LivreurExterneApp
- **Fichier** : `pages/LivreurExterneApp.jsx`
- **Ligne 10** : `import LivreurStatutCard from "@/components/livreur/LivreurStatutCard";`
- **Statut** : ✅ CORRECT - Import unique et propre

### 3. Appel avec prop isExterne
- **Ligne 383** : `<LivreurStatutCard statut={livreurProfil.statut} livreur={livreurProfil} isExterne={true} />`
- **Statut** : ✅ CORRECT - La prop `isExterne={true}` est bien passée

### 4. Recherche des occurrences "Batterie"
- **BatterieFaibleButton.jsx** : ✅ Seul composant contenant le bouton
- **LivreurStatutCard.jsx** : ✅ Importe et affiche conditionnellement
- **Aucune autre occurrence** : ✅ Pas de bouton hardcodé ailleurs

### 5. Logique conditionnelle
```jsx
// Dans LivreurStatutCard.jsx ligne 59
{!isExterne && (isDisponible || isEnCourse) && livreur && (
  <div className="pt-1">
    <BatterieFaibleButton livreur={livreur} />
  </div>
)}
```
- **Statut** : ✅ CORRECT - Le bouton n'est affiché QUE si `isExterne === false`

---

## 🎯 Conclusion du Diagnostic

**Le code est CORRECT !** ✅

La logique conditionnelle est bien en place :
- Livreurs **INTERNES** (`isExterne=false`) → ✅ Bouton affiché
- Livreurs **EXTERNES** (`isExterne=true`) → ❌ Bouton MASQUÉ

---

## 🧹 Problème : Cache Build/APK

Si le bouton apparaît toujours dans l'APK, c'est un problème de **cache de build** ou d'**ancienne APK**.

### Solution : Nettoyage Complet

#### 1. Nettoyer le cache Vite/React
```bash
bash scripts/clean-cache.sh
```

#### 2. Rebuild complet
```bash
npm run build
```

#### 3. Uninstall ancienne APK (sur device Android)
```bash
adb uninstall com.silgapp2.app
```
Ou manuellement : Paramètres → Applications → SILGAPP2 → Désinstaller

#### 4. Install nouvelle APK
```bash
adb install dist/android/app/build/outputs/apk/release/app-release.apk
```

#### 5. Vérifier dans le DOM
Après installation, ouvrir Chrome DevTools sur le device :
```javascript
// Dans la console du navigateur
document.querySelectorAll('button').forEach(btn => {
  if (btn.textContent.includes('Batterie')) {
    console.log('BOUTON TROUVÉ:', btn);
  }
});
```

---

## 📋 Checklist Finale

- [ ] Exécuter `scripts/clean-cache.sh`
- [ ] Rebuild avec `npm run build`
- [ ] Uninstall ancienne APK du device
- [ ] Install nouvelle APK
- [ ] Tester avec un compte livreur **externe**
- [ ] Vérifier dans DevTools qu'aucun bouton "Batterie" n'existe dans le DOM

---

## 🚨 Si le problème persiste

Vérifier ces points :
1. **Bon compte de test** : S'assurer que le livreur a bien `type_livreur="externe"`
2. **Bon environnement** : Vérifier que l'APK buildée est bien la dernière version
3. **Hard reload** : Dans Chrome DevTools → Network tab → Cocher "Disable cache"
4. **Version number** : Vérifier `versionCode` dans `capacitor.config.json`

---

**Date du diagnostic** : 2025-05-25
**Statut** : ✅ Code corrigé, reste à rebuild APK propre