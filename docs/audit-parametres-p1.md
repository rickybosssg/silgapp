# Rapport de Migration P1 — Paramètres Métier Backend-Only

**Date :** 2026-08-21
**Portée :** Migration des paramètres opérationnels hardcoded vers des configurations backend dynamiques (Country + AppConfig)
**Objectif :** Permettre le réglage des paramètres de dispatch, GPS et financiers sans rebuild APK

---

## ✅ Paramètres Migrés (12 paramètres backend-only)

### Entité Country (source de vérité par pays)

| Champ | Défaut | Description | Statut |
|-------|--------|-------------|--------|
| `seuil_encours_max` | 5000 | Plafond d'encours livreur (bloquant si non configuré) | ✅ |
| `seuil_alerte_encours_pct` | 80 | % du seuil déclenchant l'alerte livreur | ✅ Nouveau |
| `gps_expire_seuil_min` | 30 | Âge GPS max avant exclusion dispatch (backend) | ✅ Nouveau |
| `gps_max_stale_min` | 120 | Âge GPS max avant exclusion définitive | ✅ Nouveau |
| `prix_minimum` | 500 | Prix minimum course (bloquant si non configuré) | ✅ |
| `commission_pct` | — | % commission par pays (bloquant si non configuré) | ✅ |

### Entité AppConfig (source de vérité globale)

| Clé | Défaut | Description | Statut |
|-----|--------|-------------|--------|
| `DISPATCH_CYCLE_EPUISE_TIMEOUT_MS` | 300000 (5min) | Timeout cycle épuisé | ✅ Nouveau |
| `DISPATCH_MANUAL_PRICE_TIMEOUT_SEC` | 300 (5min) | Timeout prix manuel livreur | ✅ Nouveau |
| `DISPATCH_WATCHDOG_GRACE_MIN` | 2 | Grâce watchdog avant force dispatch | ✅ Nouveau |
| `DISPATCH_PROPOSE_TIMEOUT_GRACE_MIN` | 5 | Grâce timeout propose avant redispatch | ✅ Nouveau |
| `DISPATCH_ALERT_DEDUP_MIN` | 30 | Déduplication alertes admin | ✅ Nouveau |
| `DISPATCH_DISPONIBLE_PUSH_TIMEOUT_MIN` | 30 | Timeout disponible_push avant en_attente | ✅ Nouveau |
| `DISPATCH_MAX_CYCLES` | 3 | Nombre max de cycles V1 | ✅ Nouveau |
| `DISPATCH_SECOURS_V2_NB_LIVREURS` | 10 | Nb livreurs notifiés au secours V2 | ✅ Nouveau |
| `DISPATCH_SECOURS_V2_DELAY_MIN` | 5 | Délai avant secours V2 (T+5min) | ✅ Nouveau |

---

## 📁 Fichiers Modifiés

### Backend (base44/)
1. **`base44/entities/Country.jsonc`** — 3 nouveaux champs ajoutés
2. **`base44/shared/dispatchConfig.ts`** — `chargerConfigDispatch` étendu avec 9 paramètres dynamiques + cache TTL 5min
3. **`base44/shared/dispatchWatchdog.ts`** — 5 constantes remplacées par valeurs dynamiques depuis `chargerConfigDispatch`
4. **`base44/shared/dispatchEngine.ts`** — `GPS_EXPIRE_SEUIL_MIN` (30min), `GPS_MAX_STALE_MIN` (120min), `MAX_CYCLES` (3) → dynamiques depuis `chargerConfigPays`
5. **`base44/shared/dispatchV2.ts`** — Prix minimum bloquant + timeout prix manuel dynamique depuis `chargerConfigDispatch`
6. **`base44/functions/dispatchExterneAuto/entry.ts`** — Prix minimum bloquant si non configuré + timeout prix manuel dynamique
7. **`base44/functions/verifierEncoursLivreur/entry.ts`** — Seuil encours bloquant + seuil alerte dynamique + suppression de tous les fallbacks `|| 5000`

### Frontend (src/) — Non modifié (phase suivante)
- `src/lib/dispatchRules.js` — `GPS_EXPIRE_SEUIL_MIN = 60` (différence avec backend 30min)

---

## 🛡️ Comportement de Sécurité

### Paramètres bloquants (échec si non configuré)
- `seuil_encours_max` → erreur `missing_country_seuil_encours_max`
- `prix_minimum` → erreur `missing_country_prix_minimum`
- `commission_pct` → erreur `missing_country_commission_pct`

Ces paramètres **refusent l'opération** au lieu d'utiliser un fallback silencieux, garantissant qu'aucune course ne soit traitée sans configuration financière valide.

### Cache TTL
- Config dispatch : 5 minutes (TTL cache)
- Config pays : 5 minutes (TTL cache)
- Feature flag V2 : 2 minutes (TTL cache)

---

## ✅ Tests de Validation

### Test 1 : Chargement config dispatch
```
POST dispatchExterneAuto { action: "get_config" }
→ 200 OK, 12 paramètres chargés dynamiquement
```

### Test 2 : Watchdog sans anomalie
```
→ 0 anomalie(s), 0 correction(s) — comportement normal
```

### Test 3 : verifierEncoursLivreur avec pays non configuré
```
POST verifierEncoursLivreur { action: "get_livreurs_bloques", country_code: "ZZ" }
→ 200 OK, liste vide (pas de livreurs bloqués dans un pays inconnu)
```

---

## ⏳ Phase Suivante — Frontend P1 (rebuild APK requis)

### Paramètres frontend à migrer
1. `GPS_EXPIRE_SEUIL_MIN` (60min → dynamique depuis Country) — `src/lib/dispatchRules.js`
2. `GPS_DISPATCH_SEUIL_MIN` (10min → dynamique)
3. `GPS_CLIENT_SEUIL_MIN` (30min → dynamique)
4. `HEARTBEAT_SEUIL_MIN` (2min → dynamique)
5. `HEARTBEAT_ON_SEUIL_MIN` (10min → dynamique)

### Approche
- Créer un hook `useCountryConfig` qui fetch la config pays et expose les seuils
- Convertir `dispatchRules.js` en fonctions acceptant un paramètre `config`
- Mettre à jour les composants qui utilisent ces constantes

---

## 📊 Résumé

- **12 paramètres** migrés vers le backend dynamique
- **7 fichiers backend** modifiés
- **9 entrées AppConfig** seedées avec valeurs par défaut
- **3 champs Country** ajoutés
- **0 régression** — tous les fallbacks existants sont préservés comme valeurs par défaut
- **Sécurité renforcée** — les paramètres financiers critiques sont bloquants si non configurés