# 📊 Spécifications Techniques - Cartes Thermiques SILGAPP v2.0

## Architecture

### Composants

#### 1. `HeatmapLayer.jsx`
**Rôle** : Génère la couche thermique sur la carte Leaflet

**Modes** :
- `"demande"` : Clients GPS + courses récentes (< 2h)
- `"couverture"` : Livreurs disponibles + en course
- `"off"` : Désactivé

**Algorithme** :
1. Filtrage des entités avec GPS valide
2. Regroupement par cellules (0.002° ≈ 200m)
3. Calcul de densité par cellule
4. Normalisation (0-1)
5. Application du gradient de couleur

**Gradients** :
- Demande : Vert (34,197,94) → Jaune (255,204,68) → Rouge (220,38,38)
- Couverture : Rouge (239,68,68) → Jaune (239,171,94) → Vert (34,197,94)

---

#### 2. `HeatmapControls.jsx`
**Rôle** : Interface de sélection des modes

**Fonctionnalités** :
- Boutons de bascule (Standard, Demande, Couverture)
- Légendes contextuelles
- Insights stratégiques via `HeatmapInsights`

---

#### 3. `HeatmapLegend.jsx`
**Rôle** : Affiche les données détaillées et conseils

**Contenu** :
- Gradient de couleur
- Compteur de points (clients, livreurs, courses)
- Conseils d'interprétation
- Alerte "données insuffisantes" (< 3 points)

---

#### 4. `HeatmapInsights.jsx`
**Rôle** : Génère des recommandations automatiques

**Logique** :

**Mode Demande** :
- < 3 points → Warning "Données insuffisantes"
- < 10 points → Info "Demande faible"
- ≥ 10 points → Success "Forte activité"
- Courses > Clients → Action "Pic de commandes"

**Mode Couverture** :
- < 3 livreurs → Warning "Couverture insuffisante"
- Ratio < 0.5 → Critical "Déséquilibre critique"
- Ratio < 1 → Action "Renforcement recommandé"
- Ratio 1-2 → Success "Équilibre optimal"
- Ratio > 2 → Info "Surcouverture"

---

#### 5. `DispatchMap.jsx` (mis à jour)
**Rôle** : Carte principale avec overlay thermique

**Nouveautés** :
- Intègre `HeatmapControls` avec données
- Intègre `HeatmapLegend` contextuelle
- Passe les données filtrées par pays
- Gère le mode via `heatmapMode` state

---

#### 6. `CarteLivreursExterne.jsx` (mis à jour)
**Rôle** : Page de supervision terrain

**Nouveautés** :
- State `heatmapMode` ("off", "demande", "couverture")
- Filtrage des courses récentes (< 2h)
- Passe les données à `DispatchMap`

---

## Algorithmes de Calcul

### 1. Demande Clients

```javascript
points = [
  ...clients.filter(c => c.latitude && c.longitude)
            .map(c => ({ lat: c.latitude, lng: c.longitude, weight: 1 })),
  
  ...courses.filter(c => created_date < 2h)
            .filter(c => c.gps_depart_lat && c.gps_depart_lng)
            .map(c => ({ lat: c.gps_depart_lat, lng: c.gps_depart_lng, weight: 2 }))
]
```

**Pondération** :
- Client = 1 point
- Course récente = 2 points (plus significatif)

---

### 2. Couverture Livreurs

```javascript
points = livreurs
  .filter(l => l.latitude && l.longitude)
  .filter(l => l.statut === "disponible" || l.statut === "en_course")
  .map(l => ({
    lat: l.latitude,
    lng: l.longitude,
    weight: l.statut === "disponible" ? 1.5 : 1
  }))
```

**Pondération** :
- Disponible = 1.5 points (plus disponible pour nouvelles courses)
- En course = 1 point (déjà occupé)

---

### 3. Calcul de Densité

**Cellules** :
- Taille : 0.002° ≈ 200 mètres
- Regroupement : `cellKey = floor(lat/cellSize) + "," + floor(lng/cellSize)`

**Normalisation** :
```javascript
maxDensity = max(densityMap.values().count)
intensity = cell.count / maxDensity  // 0 à 1
```

**Couleur** :
```javascript
if (intensity < 0.33) {
  // Faible → Vert ou Rouge selon mode
  t = intensity / 0.33
  fillColor = interpolate(color_low, color_mid, t)
} else if (intensity < 0.66) {
  // Moyen → Jaune
  t = (intensity - 0.33) / 0.33
  fillColor = interpolate(color_mid, color_high, t)
} else {
  // Fort → Rouge ou Vert selon mode
  t = (intensity - 0.66) / 0.34
  fillColor = color_high
}
```

---

## Seuils et Constantes

### GPS Valide
- **Clients** : < 30 minutes
- **Livreurs** : < 10 minutes

### Courses Récentes
- **Fenêtre** : < 2 heures

### Minimum de Détection
- **Points requis** : 3
- **Message** : "Données insuffisantes pour générer une carte thermique"

### Cellules
- **Taille** : 0.002° (≈ 200m)
- **Rayon cercles** : 35-45 pixels

---

## Filtres par Pays

**Logique** :
```javascript
const filter = countryCode ? { country_code: countryCode } : {};
const clients = await base44.entities.ClientExterne.filter(filter);
const livreurs = await base44.entities.Livreur.filter(filter);
const courses = await base44.entities.CourseExterne.filter(filter);
```

**Impact** :
- Seules les données du pays sélectionné sont utilisées
- Permet une analyse marché par marché
- Évite le bruit des autres pays

---

## Performance

### Optimisations
1. **Filtrage client-side** : Évite les requêtes multiples
2. **Memoization** : `useMemo` pour les calculs intensifs
3. **Cellules** : Réduit le nombre de points à renderer
4. **Cleanup** : Suppression ancienne heatmap avant nouvelle

### Rafraîchissement
- **Clients/Livreurs** : 15 secondes
- **Courses** : 15 secondes
- **Heatmap** : Recalcul automatique à chaque changement de données

---

## UX/UI

### Couleurs Sémantiques

**Demande** :
- 🟢 Vert (#22c55e) = Faible
- 🟡 Jaune (#facc15) = Moyen
- 🔴 Rouge (#dc2626) = Fort

**Couverture** :
- 🔴 Rouge (#ef4444) = Manque
- 🟠 Orange (#efab5e) = Moyen
- 🟢 Vert (#22c55e) = Bon

### Opacité
- **Cercles** : 0.65 (laisse voir les marqueurs)
- **Overlay** : 0.95 (légendes)

### Z-Index
- **Marqueurs** : 900-1200
- **Heatmap** : 400-600 (derrière les marqueurs)
- **Contrôles** : 1000
- **Légendes** : 1000

---

## Tests et Validation

### Scénarios de Test

1. **Données insuffisantes** :
   - < 3 clients → Message jaune
   - < 3 livreurs → Message jaune

2. **Filtrage pays** :
   - Sélectionner BF → Voir uniquement données BF
   - Sélectionner CI → Voir uniquement données CI

3. **Temps réel** :
   - Créer course → Heatmap mise à jour < 15s
   - Changer statut livreur → Heatmap mise à jour < 15s

4. **Bascule modes** :
   - Standard → Demande → Couverture → Standard
   - Vérifier légendes et insights

5. **Insights** :
   - Ratio < 0.5 → Critical
   - Ratio 1-2 → Success
   - Courses > Clients → Action

---

## Déploiement

### Fichiers Modifiés
- `components/carte/HeatmapLayer.jsx`
- `components/carte/DispatchMap.jsx`
- `pages/CarteLivreursExterne.jsx`

### Fichiers Créés
- `components/carte/HeatmapControls.jsx`
- `components/carte/HeatmapLegend.jsx`
- `components/carte/HeatmapInsights.jsx`
- `CARTES-THERMIQUES-GUIDE.md`
- `SPECIFICATIONS-CARTES-THERMIQUES.md`

### Backward Compatibility
- ✅ Mode "off" par défaut
- ✅ Ancienne carte standard préservée
- ✅ Pas d'impact sur le dispatch

---

## Roadmap

### v2.1 (Futur)
- [ ] Historique 24h (glissant)
- [ ] Export PDF des cartes
- [ ] Alertes automatiques (zones rouges)
- [ ] Prédictions (IA/ML)

### v2.2 (Futur)
- [ ] Comparaison jour/semaine/mois
- [ ] Heatmap multi-pays (vue globale)
- [ ] Intégration météo/trafic

---

**Version** : 2.0  
**Date** : 31 mai 2026  
**Statut** : ✅ Production ready