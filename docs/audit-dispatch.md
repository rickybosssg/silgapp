# AUDIT COMPLET DU MOTEUR DE DISPATCH SILGAPP

**Date :** 2026-07-26
**Fichier audité :** `base44/functions/dispatchExterneAuto/entry.ts` (1613 lignes)
**Automations liées :** 7 (2 programmées, 2 entité, 3 archivées)
**Statut :** Aucune modification effectuée — en attente de validation

---

## RÉSUMÉ EXÉCUTIF

| Gravité | Count |
|---------|-------|
| 🔴 Critique | 5 |
| 🟠 Majeur | 8 |
| 🟡 Moyen | 7 |
| 🟢 Mineur | 6 |
| **Total** | **26** |

---

## 🔴 PROBLÈMES CRITIQUES

### C1. Filtre de courses limité à 50 — courses invisibles au-delà

**Impact :** À partir de ~50 courses simultanées en `recherche_livreur` + `nouvelle`, les courses les plus anciennes ne sont JAMAIS traitées par le tick automatique. Elles restent bloquées indéfiniment.

**Cause :** Lignes 1161-1167 — deux filtres `CourseExterne.filter(..., 50)` chacun. Le tableau combiné est capped à 50+50=100 mais dédupliqué. Le `MAX_COURSES_PER_TICK = 10` (ligne 1178) aggrave encore : seules 10 courses sont traitées par tick de 5 min.

**Fichier :** `dispatchExterneAuto/entry.ts` lignes 1158-1197

**Solution recommandée :**
- Paginer le filtre (boucle avec skip) ou augmenter la limite à 500
- Augmenter `MAX_COURSES_PER_TICK` à 30-50
- Ou : traiter par pays en parallèle (un invocation par pays)

**Risques :** Plus d'appels API par tick → risque de rate limit accru. Mitigation : traiter les courses bloquées en priorité et ignorer les `propose` non expirées (déjà fait via `isStuck`).

**Tests :** Créer 60 courses en `recherche_livreur`, vérifier que la 60e est traitée dans les 10 min.

---

### C2. Aucun verrou distribué — traitement concurrent d'une même course

**Impact :** Deux ticks de dispatch (entity automation + scheduled) peuvent traiter la même course simultanément. Résultat : double-notification des livreurs, ou la course passe en `propose` puis est immédiatement re-dispatchée par l'autre tick.

**Cause :** L'entity automation "Dispatch Auto Externe" (create) et "Dispatch auto - courses en attente" (update) se déclenchent en PLUS des 2 automations programmées (00:00 et 00:02). Aucun mécanisme ne pose de verrou avant traitement.

**Fichier :** Automations + `lancerDispatchMulti()` (ligne 403)

**Solution recommandée :**
- Ajouter un champ `dispatch_locked_at` (timestamp) sur CourseExterne
- En début de `lancerDispatchMulti` : poser un verrou conditionnel (`updateMany` avec `dispatch_locked_at` vide ou expiré < 30s)
- En fin de fonction : libérer le verrou
- Si verrou déjà posé par un autre tick → return immédiat

**Risques :** Si la fonction crash avant de libérer le verrou → course bloquée 30s. Mitigation : TTL de 30s sur le verrou, libéré automatiquement.

**Tests :** Déclencher 2 appels `lancer_recherche_auto` simultanés sur la même course, vérifier qu'un seul traite.

---

### C3. `trouverLivreursCandidats` retourne `[]` au lieu de `{tous:[]}` quand 0 livreur

**Impact :** Quand aucun livreur n'est trouvé, la fonction retourne `[]` (tableau vide) au lieu de l'objet attendu `{tous:[], niveau1:[], ...}`. Le code appelant fait `resultat.tous` → `undefined` → `candidats = undefined` → crash silencieux ou comportement imprévisible.

**Cause :** Ligne 179 : `if (!tousLivreurs || tousLivreurs.length === 0) return [];` — retourne un tableau au lieu d'un objet.

**Fichier :** `dispatchExterneAuto/entry.ts` ligne 179

**Solution recommandée :**
```js
if (!tousLivreurs || tousLivreurs.length === 0) {
  return { tous: [], niveau1: [], niveau2: [], niveau3: [], pickupSource: 'none', raisonsExclusion: [] };
}
```

**Risques :** Aucun — correction de bug pur.

**Tests :** Créer une course dans un pays sans livreur, vérifier que `cycle_epuise` est atteint sans crash.

---

### C4. Course sans `country_code` → dispatch totalement bloqué

**Impact :** Une course sans `country_code` ne peut JAMAIS être dispatchée. `trouverLivreursCandidats` retourne immédiatement (ligne 165-168), `lancerDispatchMulti` obtient 0 candidats, incrémente la vague, atteint `cycle_epuise`, envoie une notification VENUS au client… mais la course reste en attente indéfiniment car aucun pays ne filtre.

**Cause :** Le `country_code` est déclaré `required` dans le schéma CourseExterne, mais les courses créées par VENUS ou par certains flux pourraient l'omettre. Aucune validation préventive dans `lancer_recherche_auto`.

**Fichier :** `dispatchExterneAuto/entry.ts` lignes 165-168, 691-721

**Solution recommandée :**
- Dans `lancer_recherche_auto` : si `!course.country_code`, créer une alerte admin et annuler la course
- Ou : inférer le pays depuis le numéro de téléphone du client

**Risques :** Annulation automatique de courses légitimes si le country_code est perdu. Mitigation : alerter l'admin au lieu d'annuler.

**Tests :** Créer une course avec `country_code: null`, vérifier qu'une alerte admin est créée.

---

### C5. Cycle `cycle_epuise` → reset → cycle_epuise en boucle infinie si 0 livreur

**Impact :** Si aucun livreur n'est disponible dans un pays, la course cycle indéfiniment : `en_attente` → vague 1 → vague 2 → vague 3 → `cycle_epuise` → VENUS demande au client → client dit "oui" → reset → vague 1 → … → `cycle_epuise` → auto-annulation après 15 min. Mais si le client répond "oui" rapidement, le cycle peut recommencer plusieurs fois, générant un volume excessif d'appels API et de notifications.

**Cause :** Le reset de cycle (ligne 511-524) vide `dispatch_notified_ids` mais ne vérifie pas combien de cycles ont déjà été tentés. Il n'y a pas de compteur de `cycle_count`.

**Fichier :** `dispatchExterneAuto/entry.ts` lignes 507-524

**Solution recommandée :**
- Ajouter un champ `dispatch_cycle_count` sur CourseExterne
- Limiter à 2 cycles maximum avant auto-annulation définitive
- Après 2 cycles → `annulee` avec motif "Aucun livreur disponible"

**Risques :** Course légitime annulée si les livreurs sont temporairement tous hors ligne. Mitigation : 2 cycles × 3 vagues × 60s = ~6 min de recherche + 15 min d'attente cycle_epuise = ~21 min total.

**Tests :** Créer une course dans un pays avec 0 livreur, vérifier qu'elle s'annule après 2 cycles.

---

## 🟠 PROBLÈMES MAJEURS

### M1. Aucune validation de transition de `dispatch_status`

**Impact :** Rien n'empêche une transition illégale (ex: `livree` → `propose`). Les incohérences s'accumulent silencieusement.

**Cause :** Aucune machine à états. Chaque action fait un `update` direct sans vérifier l'état précédent (sauf `accepter_course` qui vérifie `dispatch_status === 'propose'`).

**Solution :** Centraliser les transitions autorisées dans un Map et valider avant chaque update.

---

### M2. `chargerLivreursEnCourse` limite à 100 courses par pays

**Impact :** Si un pays a > 100 courses, certaines courses actives ne sont pas détectées → un livreur en course pourrait recevoir une 2e proposition.

**Cause :** Ligne 101-104 : `filter(..., '-created_date', 100)`.

**Solution :** Filtrer directement par `statut` actif au lieu de récupérer 100 courses puis filtrer en mémoire.

---

### M3. Cache de config partagé entre `dispatch` et `gps` avec un seul TTL

**Impact :** Si un admin modifie la config dispatch, le cache met jusqu'à 5 min à se rafraîchir. Les vagues utilisent l'ancienne config.

**Cause :** Lignes 7-9 : `CONFIG_CACHE = { dispatch: null, gps: null, expires: 0 }` — un seul `expires` pour les deux.

**Solution :** Séparer les TTL ou invalider le cache après un `set_config` / `set_wave_config`.

---

### M4. Notifications fire-and-forget — aucune garantie de livraison

**Impact :** Si `envoiNotificationPush` échoue (FCM down, token expiré), le livreur ne sait jamais qu'une course est disponible. Le dispatch pense l'avoir notifié (`dispatch_notified_ids`), attend le timeout, puis passe à la vague suivante.

**Cause :** Lignes 334-343 : `.catch(err => console.error(...))` — l'erreur est loggée mais aucune retry n'est tentée.

**Solution :** Ajouter un champ `notification_delivered` vérifié au prochain tick. Si une notification n'a pas été délivrée après 30s, re-notifier le livreur.

---

### M5. Aucun nettoyage de `dispatch_notified_ids` pour les livreurs supprimés

**Impact :** Si un livreur est supprimé après avoir été notifié, son ID reste dans `dispatch_notified_ids`. Au reset de cycle, il est retiré de la liste, mais entre-temps, l'ID occupe de l'espace et fausse le comptage.

**Cause :** Aucun nettoyage proactif.

**Solution :** Lors du reset de cycle, filtrer `dispatch_notified_ids` pour ne garder que les livreurs existants.

---

### M6. `avancer_vagues_expirees` ne filtre pas par `dispatch_status` au niveau DB

**Impact :** Récupère 50 courses en `recherche_livreur` + 50 en `nouvelle/en_attente`, puis filtre en JS. Des courses en `recherche_livreur` avec `dispatch_status: 'accepte'` sont inutilement récupérées.

**Cause :** Le filtre DB ne peut pas filtrer par `dispatch_status` car il n'est pas indexé ou le filtre ne le supporte pas.

**Solution :** Ajouter `dispatch_status` au filtre DB si possible, sinon accepter le overhead.

---

### M7. Délai de 200ms anti-race dans `accepter_course` — inefficace

**Impact :** Le `setTimeout(resolve, 200)` (ligne 869) ralentit chaque acceptation de 200ms sans garantie réelle. Deux livreurs peuvent passer le double-check pendant ce délai.

**Cause :** Le délai est arbitraire et ne pose pas de verrou.

**Solution :** Supprimer le déai. Le `updateMany` conditionnel (ligne 943) gère déjà l'atomicité. Le délai ne fait qu'ajouter de la latence.

---

### M8. Aucune gestion des courses "orphelines" (statut `nouvelle` sans `dispatch_status`)

**Impact :** Une course créée avec `statut: 'nouvelle'` mais `dispatch_status: null` (au lieu de `en_attente`) n'est pas récupérée par `avancer_vagues_expirees` (qui filtre `dispatch_status: 'en_attente'`). Elle reste bloquée à `nouvelle` indéfiniment.

**Cause :** Ligne 1165 : `filterNouvelles = { statut: 'nouvelle', dispatch_status: 'en_attente' }` — `null` ≠ `'en_attente'`.

**Solution :** Ajouter un filtre pour `dispatch_status` null/undefined, ou normaliser à la création.

---

## 🟡 PROBLÈMES MOYENS

### Moy1. GPS identique pour plusieurs livreurs — pas de dédoublonnage

Si deux livreurs ont exactement les mêmes coordonnées GPS (ex: même point de ralliement), ils sont tous les deux notifiés. Pas d'impact fonctionnel mais gaspillage de notifications.

### Moy2. Aucune validation de la validité du GPS livreur

Un livreur avec des coordonnées (0, 0) ou (lat: 999) n'est pas filtré. La distance calculée sera absurde mais le livreur sera quand même notifié.

**Solution :** Valider `latitude ∈ [-90, 90]` et `longitude ∈ [-180, 180]`.

### Moy3. `dispatch_wave` peut dépasser `gpsConfig.waves.length`

Si les vagues sont mal configurées (ex: 0 vague), `gpsConfig.waves.length = 0` et `wave > 0` → `waveIndex = Math.min(wave - 1, -1)` → `gpsConfig.waves[-1]` = `undefined` → crash.

**Solution :** Valider que `gpsConfig.waves.length > 0` avec un fallback.

### Moy4. Aucune limite sur la taille de `dispatch_notified_ids`

Le champ est un string JSON. Si 200 livreurs sont notifiés sur plusieurs cycles, le string peut devenir très long et dépasser la limite de champ de l'entité.

**Solution :** Capper à 50 IDs ou utiliser un format plus compact.

### Moy5. `notifierRedispatchClient` appelé en `await` dans `verifier_expiration` mais en `fire-and-forget` dans `avancer_vagues_expirees`

Incohérence : un chemin bloque, l'autre non. Si `notifierRedispatchClient` échoue dans le chemin `await`, la réponse HTTP est retardée.

### Moy6. Aucun log quand une course est ignorée car `statut` est déjà terminal

Lignes 413-415 : si la course est `livree` ou `annulee`, return `{ ignore: true }` silencieusement. Aucun log. Difficile à déboguer.

### Moy7. `retry_courses_en_attente` est redondant avec `avancer_vagues_expirees`

L'action `retry_courses_en_attente` (ligne 1374) fait la même chose que la section `en_attente/redispatch` de `avancer_vagues_expirees` (ligne 1233). Code dupliqué.

---

## 🟢 PROBLÈMES MINEURS

### Min1. Logs excessifs en production

Chaque tick génère des `console.log` pour chaque course traitée. À 100 courses, c'est 100+ logs par tick.

### Min2. `generateToken` et `generatePIN` utilisés dans `accepter_course` — devraient être à la création

Les tokens/PIN sont générés à l'acceptation (lignes 900-903) si absents. Ils devraient toujours exister depuis la création de course. Code défensif inutile.

### Min3. `INDICATIFS` recodés en dur dans `notifierLivreur`

Ligne 355 : les indicatifs pays sont dupliqués. Ils existent déjà dans `PAYS_SILGAPP` (CountrySelector.jsx) et probablement dans `phoneUtils.ts`.

### Min4. `TIEBREAKER_DISTANCE_M = 100` — 100m est arbitrairement petit

En moto, 100m ne fait aucune différence. Le tiebreaker GPS ne se déclenche presque jamais.

### Min5. Pas de métrique sur le temps de traitement par course

Aucun timer sur `lancerDispatchMulti`. Impossible de savoir quelles courses sont lentes.

### Min6. Le fichier fait 1613 lignes — au-delà de la limite recommandée de 1300

Le fichier approche la limite d'édition. Devrait être refactorisé en modules partagés.

---

## ANALYSE DE SCALABILITÉ

| Courses simultanées | Capacité actuelle | Point de rupture |
|---------------------|-------------------|------------------|
| 100 | ✅ OK (~50 min pour traiter tout) | — |
| 500 | ⚠️ Critique — 50 courses invisibles | Filtre limité à 50 |
| 1 000 | ❌ Échec — 950 courses non traitées | Filtre + MAX_COURSES_PER_TICK |
| 5 000 | ❌ Échec total | Tout le moteur sature |

**Points de rupture identifiés :**
1. Filtre DB limité à 50 courses (C1)
2. `MAX_COURSES_PER_TICK = 10` — 10 courses / 5 min = 2 courses/min
3. `chargerLivreursEnCourse` limité à 100 courses (M2)
4. Pas de parallélisation par pays
5. Pas de file d'attente prioritaire

---

## AUTOMATIONS — ANALYSE

| Automation | Type | Fréquence | Statut | Problème |
|-----------|------|-----------|--------|----------|
| Avancement Vagues Dispatch | scheduled | 5 min (00:00) | ✅ active | Doublon avec Tick décalé |
| Avancement Vagues Dispatch — Tick décalé | scheduled | 5 min (00:02) | ⚠️ last_run=null | Peut ne pas fonctionner |
| Dispatch Auto Externe | entity (create) | — | ✅ active | Conflit avec scheduled |
| Dispatch auto - courses en attente | entity (update) | — | ✅ active | Conflit avec scheduled |
| Retry Dispatch Externe | scheduled | 5 min | ❌ archivée | Redondant |
| Moteur Dispatch Auto - Tick | scheduled | 5 min | ❌ archivée | Obsolète |
| Dispatch courses programmées | scheduled | 5 min (00:04) | ✅ active | OK — separate concern |

**Conflit identifié :** 4 automations actives peuvent déclencher `dispatchExterneAuto` sur la même course. L'entity automation (create) se déclenche à la création, puis l'entity automation (update) se déclenche quand le statut passe à `recherche_livreur`, puis les 2 scheduled peuvent aussi traiter la course. → Voir C2.

---

## TESTS À RÉALISER APRÈS CORRECTION

1. **C1** — Créer 60 courses, vérifier que toutes sont traitées
2. **C2** — Déclencher 2 dispatch simultanés, vérifier qu'un seul traite
3. **C3** — Course sans livreur, vérifier `cycle_epuise` sans crash
4. **C4** — Course sans country_code, vérifier alerte admin
5. **C5** — Course avec 0 livreur, vérifier auto-annulation après 2 cycles
6. **M1** — Tenter transition `livree` → `propose`, vérifier refus
7. **M4** — Simuler échec FCM, vérifier retry
8. **M8** — Course avec `dispatch_status: null`, vérifier prise en charge
9. **Scalabilité** — Test de charge avec 500 courses simulées
10. **Régression** — Refaire le scénario de la course KOURITENGA → TENGANDOGO

---

## PRIORITÉ DE CORRECTION RECOMMANDÉE

| Priorité | Problème | Effort | Impact |
|----------|----------|--------|--------|
| 1 | C3 (return [] au lieu d'objet) | 5 min | Crash immédiat |
| 2 | C4 (course sans country_code) | 15 min | Blocage permanent |
| 3 | C2 (verrou distribué) | 45 min | Double-dispatch |
| 4 | C1 (filtre 50 → 500) | 10 min | Scalabilité |
| 5 | C5 (limite cycles) | 20 min | Boucle infinie |
| 6 | M7 (supprimer retry redondant) | 5 min | Dette technique |
| 7 | M4 (retry notifications) | 30 min | Fiabilité |
| 8 | M2 (chargerLivreursEnCourse) | 15 min | Double-proposition |
| 9 | M8 (orphelines sans dispatch_status) | 10 min | Blocage silencieux |
| 10 | M1 (machine à états) | 60 min | Cohérence |

---

*Audit terminé — en attente de validation pour débuter les corrections.*
