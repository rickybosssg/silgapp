import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const hook = read("src/hooks/useCoursesDisponibles.js");
const activity = read("src/components/livreur/ActiviteTempsReel.jsx");
const available = read("src/components/livreur/CoursesDisponibles.jsx");
const dashboard = read("src/pages/LivreurExterneApp.jsx");

assert.match(activity, /useCoursesDisponibles\(livreurProfil\)/, "ActiviteTempsReel doit utiliser le hook partagé");
assert.match(available, /useCoursesDisponibles\(livreurProfil\)/, "CoursesDisponibles doit utiliser le hook partagé");
assert.match(dashboard, /useCoursesDisponibles\(livreurProfil\)/, "Le badge du dashboard doit utiliser le hook partagé");
assert.doesNotMatch(dashboard, /courses-disponibles-count/, "L'ancienne requête de compteur dupliquée doit être supprimée");

assert.match(activity, /eligibleCourses\.length/, "Le compteur d'activité doit compter toutes les courses éligibles");
assert.match(activity, /closestCourse = coursesWithDistance\[0\]/, "La course la plus proche doit provenir des courses éligibles géolocalisées");
assert.doesNotMatch(activity, /disponible(?:s)? dans ton rayon/, "Aucun faux rayon de recherche ne doit être affiché");

assert.match(hook, /course\.statut !== "recherche_livreur"/, "Le hook doit exclure les statuts non recherchés");
assert.match(hook, /course\.dispatch_status !== "disponible_push"/, "Le hook doit contrôler le statut Dispatch V2");
assert.match(hook, /course\.livreur_id \|\| course\.accepted_by_livreur_id/, "Le hook doit exclure les courses déjà attribuées");
assert.match(hook, /refusedCourseIds\.includes\(course\.id\)/, "Les refus backend doivent être appliqués");
assert.match(hook, /DISMISS_TTL_MS = 30 \* 60 \* 1000/, "Le TTL local de 30 minutes doit être conservé");
assert.match(hook, /silgapp:dismissed-courses-changed/, "Les refus locaux doivent se synchroniser entre composants");
assert.match(hook, /if \(!livreurDisponible \|\| !isV2Enabled\) return \[\]/, "Un livreur OFF ou indisponible ne doit voir aucune course");

assert.match(dashboard, /CourseExterne\.subscribe/, "Les mises à jour de courses doivent être suivies en temps réel");
assert.match(dashboard, /DispatchNotification\.subscribe/, "Les refus backend doivent être suivis en temps réel");
assert.match(dashboard, /scrollIntoView/, "L'onglet actif doit devenir entièrement visible sur petit écran");
assert.match(dashboard, /overflow-x-auto/, "La navigation Livreur doit rester défilable horizontalement");
assert.match(dashboard, /whitespace-nowrap/, "Les libellés d'onglets ne doivent pas être coupés");

console.log("COURSES_DISPONIBLES_REGRESSION=PASS shared_source=PASS realtime=PASS refusals=PASS responsive_nav=PASS");
