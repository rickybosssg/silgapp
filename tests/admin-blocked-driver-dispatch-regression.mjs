import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const hook = read("src/hooks/useCoursesDisponibles.js");
const available = read("src/components/livreur/CoursesDisponibles.jsx");
const authGate = read("src/components/auth/AuthGate.jsx");
const dispatchV2 = read("base44/shared/dispatchV2.ts");
const watchdog = read("base44/shared/dispatchWatchdog.ts");
const pushT10 = read("base44/shared/pushGeneralT10.ts");

assert.doesNotMatch(
  authGate,
  /if \(livreur\.actif === false\) \{ setBlockedLivreur\(livreur\); setState\("livreur_bloque"\); return; \}/,
  "AuthGate must not send validation=valide inactive/admin-blocked drivers to Compte désactivé"
);
assert.match(
  authGate,
  /livreur\.validation === "en_attente"[\s\S]*livreur\.validation === "refuse"[\s\S]*livreur\.validation !== "valide"/,
  "AuthGate must keep pending/refused/invalid driver accounts blocked"
);

const feedVisibilityBlock = hook.match(/const livreurPeutVoirFil[\s\S]*?;/)?.[0] || "";
assert.match(
  feedVisibilityBlock,
  /livreurProfil\?\.validation === "valide"/,
  "validated drivers must be able to see the Disponibles feed"
);
assert.doesNotMatch(
  feedVisibilityBlock,
  /admin_hors_ligne|actif === true|actif === false/,
  "feed visibility must be separate from admin block and actif=false"
);
assert.match(
  hook,
  /livreurProfil\?\.admin_hors_ligne === true \|\| livreurProfil\?\.actif === false[\s\S]*Votre compte est bloqué par l'administrateur/,
  "blocked admin/inactive valid driver must get a clear accept-block reason"
);
assert.match(available, /raisonBlocage \?/, "accept button must be replaced by a locked reason when blocked");
assert.match(
  dispatchV2,
  /function peutRecevoirPushNouvelleCourse\(livreur: any\): boolean[\s\S]*manual_hors_ligne === true[\s\S]*statut === 'disponible'\) return livreur\.actif === true[\s\S]*statut === 'hors_ligne' && livreur\.admin_hors_ligne === true/,
  "T0/T+5 push eligibility must include only admin-blocked hors_ligne drivers, not all offline drivers"
);
assert.match(dispatchV2, /statut:\s*\{\s*\$in:\s*\['disponible', 'hors_ligne'\]\s*\}/, "T0/T+5 must fetch available and admin-blocked offline statuses");
assert.match(dispatchV2, /peutRecevoirPushNouvelleCourse\(livreur\)/, "T0 candidates must use the blocked-admin push guard");
assert.match(dispatchV2, /peutRecevoirPushNouvelleCourse\(l\)/, "T+5 candidates must use the blocked-admin push guard");
assert.match(dispatchV2, /courseEnterpriseId[\s\S]*enterprise_id: courseEnterpriseId[\s\S]*enterprise_id: null/, "T0/T+5 must preserve Public/Enterprise isolation");

assert.match(watchdog, /normalizeEnterpriseId/, "T+20 must normalize enterprise scope");
assert.match(watchdog, /statut:\s*\{\s*\$in:\s*\['disponible', 'hors_ligne'\]\s*\}/, "T+20 must fetch available and admin-blocked offline statuses");
assert.match(
  watchdog,
  /l\.statut === 'disponible' && l\.actif === true[\s\S]*l\.statut === 'hors_ligne' && l\.admin_hors_ligne === true/,
  "T+20 must not include all offline drivers"
);
assert.match(watchdog, /enterprise_id: courseEnterpriseId[\s\S]*enterprise_id: null/, "T+20 must preserve Public/Enterprise isolation");

assert.match(pushT10, /admin_hors_ligne retiré/, "T+10 correction must remain documented");
assert.match(pushT10, /l\.manual_hors_ligne !== true/, "T+10 must continue excluding manually offline drivers");
assert.match(pushT10, /l\.actif === true[\s\S]*l\.statut === 'hors_ligne' && l\.admin_hors_ligne === true/, "T+10 must include admin-blocked inactive drivers without including all inactive drivers");

assert.match(dispatchV2, /livreur\.admin_hors_ligne !== true/, "accepterCourseV2 must still reject admin-blocked drivers");
assert.match(dispatchV2, /livreur\.actif === true/, "accepterCourseV2 must still reject inactive/admin-blocked direct acceptance");
assert.match(dispatchV2, /reason: 'livreur_indisponible'/, "backend direct acceptance must remain refused for blocked drivers");

console.log("PASS: admin-blocked drivers see feed/receive V2 push reminders but cannot accept.");
