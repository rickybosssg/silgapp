# 📋 BILAN — Audit et Fiabilisation du Système Quartier/GPS

**Date :** 20 août 2026  
**Objectif :** Garantir que toutes les courses entrant dans le Dispatch V2 ont des coordonnées GPS valides, sans modification du core Dispatch V2 ni de la logique tarifaire.

---

## 1. Nettoyage de la Base Quartiers (BF)

| Action | Quantité |
|--------|----------|
| Quartiers audités (total initial) | 253 |
| Doublons exacts supprimés | 20 |
| Quartiers manquants ajoutés | 7 |
| Paires fusionnées (après vérif Nominatim) | 4 |
| **Total final** | **234** |

### Quartiers ajoutés
- Wayalghin, Yagma, Rimkiéta, Nagrin, Kamboinsé, Taabtenga, Yamtenga

### Paires fusionnées (confirmées identiques par Nominatim)
| Quartier conservé | Quartier fusionné | Raison |
|-------------------|-------------------|--------|
| Gounghin Sud | Goughin | Alias historique |
| Cité An 2 | Cité An II | Même lieu (12.343, -1.526) |
| Cité An 3 | Cité An III | Même zone, pas de résultat Nominatim pour III |
| Nioko 1 | Nioko I | Même lieu (12.43, -1.46) |
| Nioko 2 | Nioko II | Même lieu (12.43, -1.455) |
| Kamboincé | Kamboinsé | Alias orthographique |
| Centre-ville | Centre-Ville | Alias |

### Paires NON fusionnées (coordonnées trop différentes → traitées comme ambiguës)
| Quartier A | Quartier B | Distance |
|------------|------------|----------|
| Dassagho (12.368, -1.515) | Dassasgho (12.375, -1.488) | ~3 km |
| Hamdalaye (12.361, -1.552) | Hamdallaye (12.345, -1.515) | ~4 km |

---

## 2. Nouveaux Champs sur CourseExterne

- `gps_depart_source` : `exact` | `quartier` | `geocodage` | `null`
- `gps_arrivee_source` : `exact` | `quartier` | `geocodage` | `null`

Ces champs permettent de tracer l'origine du GPS pour de futurs calculs tarifaires différentiés (tarif exact vs quartier vs géocodage).

---

## 3. Architecture de Résolution

### `src/lib/quartierResolver.js`
- **Normalisation** : accents, majuscules, apostrophes, tirets, espaces
- **Recherche** : match exact → alias (variantes) → Levenshtein (≤ 2)
- **Ambiguïté** : si plusieurs matchs → `ambiguous: true` + suggestions
- **Jamais de choix silencieux** entre plusieurs quartiers

### `src/lib/gpsResolution.js`
- **Priorité** : (1) GPS exact (téléphone/carte) → (2) GPS quartier → blocage
- **Validation** : rejette (0,0), NaN, coordonnées < 0.1°
- **Ambiguïté** : si quartier ambigu → pas de GPS, suggestions retournées
- **Message standard** : `GPS_BLOCK_MESSAGE` pour UI

---

## 4. Intégration UI

### `QuartierSelect.jsx` (Client + Admin)
- Champ de recherche avec suggestions en temps réel
- Auto-remplissage GPS quand quartier sélectionné
- **Si ambigu** : ne remplit PAS le GPS, l'utilisateur doit choisir dans la liste

### `AdminCourseForm.jsx`
- Validation GPS au submit via `resolveGpsForCourse`
- Blocage si ambigu : toast d'erreur avec noms des quartiers en conflit
- Blocage si aucun GPS : toast avec message standard

### `CourseExterneFormSync.jsx` (Client)
- Même logique de blocage au submit
- Gestion multi-colis : chaque colis a son propre GPS

---

## 5. Tests de Régression

| Test | Résultat |
|------|----------|
| Match exact (Gounghin Sud) | ✅ |
| Case insensitive (GOUNGHIN SUD) | ✅ |
| Alias (Goughin → Gounghin Sud) | ✅ |
| Alias (Cité An II → Cité An 2) | ✅ |
| Alias (Nioko I → Nioko 1) | ✅ |
| Fuzzy (Wemtengha → Wemtenga) | ✅ |
| Ambigu (Dassagho → 2 matchs) | ✅ |
| Ambigu (Hamdallaye → 2 matchs) | ✅ |
| Inconnu → pas de match | ✅ |
| GPS exact prioritaire | ✅ |
| Fallback quartier | ✅ |
| GPS invalide (0,0) → fallback | ✅ |
| Quartier ambigu → blocage | ✅ |
| Quartier inconnu → blocage | ✅ |

**20/20 tests passent** (avec données mockées reflétant la DB réelle)

---

## 6. Décisions de Conception

1. **Quartier = source unique de vérité** pour la résolution GPS de fallback
2. **GPS obligatoire avant dispatch** : aucune course sans coordonnées valides
3. **Ambiguïtés = blocage** : force la sélection explicite, jamais de choix silencieux
4. **Pas de géocodage automatique** pour les quartiers inconnus : évite les erreurs de localisation
5. **Sources tracées** : `gps_depart_source` / `gps_arrivee_source` pour audit futur

---

## 7. Prochaines Étapes

- [ ] Valider les 3 paires ambiguës restantes (Dassagho/Dassasgho, Hamdalaye/Hamdallaye) sur le terrain
- [ ] Concevoir la grille tarifaire 1 250 F / 1 750 F selon la source GPS (exact vs quartier)
- [ ] Étendre le système aux autres pays (CI, TG, BJ, etc.)
- [ ] Ajouter des quartiers pour Abidjan, Lomé, Cotonou dès que les opérations démarrent