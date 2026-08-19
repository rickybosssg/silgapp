import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVE_LIVREUR_COURSE_STATUSES,
  isCourseAcceptedByLivreur,
  isCourseAssignedToLivreur,
  listIncludesLivreur,
  normalizeFourDigitPin,
} from "../src/lib/livreurCourseState.js";

const livreurId = "livreur-42";

for (const statut of [
  "livreur_en_route",
  "arrive_prise_en_charge",
  "colis_recupere",
  "passager_embarque",
  "pris_en_charge",
  "en_livraison",
  "arrivee",
]) {
  assert.equal(ACTIVE_LIVREUR_COURSE_STATUSES.has(statut), true, `${statut} doit rester visible`);
}

assert.equal(isCourseAssignedToLivreur({ livreur_id: livreurId }, livreurId), true);
assert.equal(isCourseAssignedToLivreur({ accepted_by_livreur_id: livreurId }, livreurId), true);
assert.equal(isCourseAssignedToLivreur({ proposed_by_livreur_id: livreurId }, livreurId), true);
assert.equal(isCourseAcceptedByLivreur({ accepted_by_livreur_id: livreurId }, livreurId), true);
assert.equal(isCourseAcceptedByLivreur({ proposed_by_livreur_id: livreurId }, livreurId), false);
assert.equal(listIncludesLivreur([livreurId], livreurId), true);
assert.equal(listIncludesLivreur(JSON.stringify([livreurId]), livreurId), true);
assert.equal(normalizeFourDigitPin(" 12 34 "), "1234");
assert.equal(normalizeFourDigitPin("１２３４"), "1234");
assert.equal(normalizeFourDigitPin("12345"), "1234");

for (const file of [
  "src/components/livreur/CourseActiveCard.jsx",
  "src/components/livreur/QRScannerModal.jsx",
  "base44/functions/validateQRCode/entry.ts",
]) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(source, /pharmacie_id/, `${file} doit reconnaitre les livraisons pharmacie`);
}

const livreurAppSource = readFileSync(
  new URL("../src/pages/LivreurExterneApp.jsx", import.meta.url),
  "utf8",
);
const coursesDisponiblesSource = readFileSync(
  new URL("../src/components/livreur/CoursesDisponibles.jsx", import.meta.url),
  "utf8",
);
const coursesDisponiblesHookSource = readFileSync(
  new URL("../src/hooks/useCoursesDisponibles.js", import.meta.url),
  "utf8",
);
const dispatchSource = readFileSync(
  new URL("../base44/functions/dispatchExterneAuto/entry.ts", import.meta.url),
  "utf8",
);
const nativePushSource = readFileSync(
  new URL("../android/app/src/main/java/com/silgapp2/app/SilgappFirebaseMessagingService.java", import.meta.url),
  "utf8",
);

assert.match(livreurAppSource, /id:\s*"disponibles"/, "l'onglet Disponibles doit etre declare");
assert.match(livreurAppSource, /activeTab === "disponibles"/, "l'onglet Disponibles doit etre rendu");
assert.match(livreurAppSource, /<CoursesDisponibles/, "le composant CoursesDisponibles doit etre monte");
assert.match(coursesDisponiblesHookSource, /\$in:\s*\["disponible_push",\s*"propose"\]/, "la liste V2 doit charger uniquement le fil actif et les propositions compatibles");
assert.doesNotMatch(coursesDisponiblesHookSource, /\$in:\s*\[[^\]]*"en_attente"/, "une course en attente ne doit jamais etre chargee dans Disponibles");
assert.match(coursesDisponiblesHookSource, /course\.statut !== "recherche_livreur"/, "seules les courses en recherche livreur doivent etre visibles");
assert.match(coursesDisponiblesHookSource, /course\.statut === "en_attente"/, "une course en attente doit etre explicitement exclue");
assert.match(coursesDisponiblesHookSource, /country_code:\s*countryCode/, "la liste doit rester isolee par pays");
assert.match(coursesDisponiblesHookSource, /refusedCourseIds\.includes\(course\.id\)/, "une course refusee ne doit pas reapparaitre");
assert.match(coursesDisponiblesHookSource, /livreurDisponible/, "un livreur hors ligne ne doit pas charger les courses disponibles");
assert.match(coursesDisponiblesSource, /durationSeconds:\s*10/, "la sonnerie V2 doit durer dix secondes");
assert.match(coursesDisponiblesSource, /action:\s*"accepter_course_v2"/, "l'acceptation doit utiliser le verrou V2 compatible avec en_attente");
assert.match(coursesDisponiblesSource, /persistDismissedCourse\(course\.id\)/, "un refus doit rester masque apres navigation");
assert.match(livreurAppSource, /CourseExterne\.subscribe[\s\S]*event\.type === "create"/, "une nouvelle course doit rafraichir le fil en temps reel");
assert.match(dispatchSource, /getLivreursRefuses/, "le backend doit verifier les refus persistants");
assert.match(dispatchSource, /isDisponiblePush\s*\?\s*isLivreurDisponible/, "le backend doit autoriser un livreur eligible en mode disponible_push");
assert.match(dispatchSource, /!refusedIds\.includes\(livreur_id\)/, "le backend doit exclure le livreur ayant refuse cette course");
const dispatchV2Source = readFileSync(
  new URL("../base44/shared/dispatchV2.ts", import.meta.url),
  "utf8",
);
const courseActiveCardSource = readFileSync(
  new URL("../src/components/livreur/CourseActiveCard.jsx", import.meta.url),
  "utf8",
);
const mainActivitySource = readFileSync(
  new URL("../android/app/src/main/java/com/silgapp2/app/MainActivity.java", import.meta.url),
  "utf8",
);
const dispatchWatchdogSource = readFileSync(
  new URL("../base44/shared/dispatchWatchdog.ts", import.meta.url),
  "utf8",
);
assert.match(livreurAppSource, /eligibleCourses:\s*availableCourses,\s*isV2Enabled\s*}\s*=\s*useCoursesDisponibles/, "le badge et l'onglet doivent partager la source V2");
assert.match(coursesDisponiblesHookSource, /DispatchNotification\.filter\([\s\S]*statut:\s*"refuse"/, "le badge doit exclure les refus persistants");
assert.match(coursesDisponiblesHookSource, /refusedIds\.includes\(course\.id\)/, "le badge doit exclure les courses masquees localement");
assert.match(livreurAppSource, /livreurProfil\.statut !== "disponible"[\s\S]*coursesActives\.length === 0[\s\S]*statut: "en_course"/, "une course active doit maintenir le livreur en_course");
assert.doesNotMatch(dispatchV2Source, /dispatch_status:[^\n]+livreur_id:\s*''/, "le verrou V2 doit accepter un livreur_id null");
assert.match(dispatchV2Source, /STATUTS_TERMINAUX_COURSE\.includes\(course\.statut\)/, "V2 doit refuser une course terminee ou annulee");
assert.doesNotMatch(dispatchV2Source, /notes:\s*`Accept/, "V2 ne doit pas exposer son journal technique dans les notes utilisateur");
assert.match(courseActiveCardSource, /!isInternalDispatchNote\(course\.notes\)/, "les anciennes notes techniques doivent rester masquees");
assert.match(dispatchWatchdogSource, /deadlineMs === 0 && course\.dispatch_status === 'disponible_push'/, "le watchdog ne doit pas retirer prematurement une course V2");
assert.match(nativePushSource, /DISPATCH_V2_ALERT_DURATION_MS\s*=\s*10000L/, "l'alerte native V2 doit durer dix secondes");
assert.match(nativePushSource, /playNotificationSound\(context, false\)/, "la sonnerie native V2 ne doit pas boucler");
assert.doesNotMatch(nativePushSource, /setFullScreenIntent\(/, "la notification V2 ne doit pas ouvrir MainActivity automatiquement");
assert.doesNotMatch(mainActivitySource, /void onResume\(\)[\s\S]*stopUrgentCourseAlert/, "reprendre l'app ne doit pas tronquer l'alerte V2");

const annulationBackendSource = readFileSync(
  new URL("../base44/functions/annulerCourseExterne/entry.ts", import.meta.url),
  "utf8",
);
assert.match(courseActiveCardSource, /maxHeight:\s*['"]88dvh['"]/, "la modale d'annulation doit tenir sur un petit ecran");
assert.match(courseActiveCardSource, /overflow-y-auto/, "le contenu de la modale d'annulation doit pouvoir defiler");
assert.match(courseActiveCardSource, /env\(safe-area-inset-bottom\)/, "le bouton d'annulation doit respecter la safe area Android et iOS");
assert.match(courseActiveCardSource, /value="autre"/, "le motif Autre doit etre disponible");
assert.match(courseActiveCardSource, /motif_detail:\s*motifAnnulationDetail\.trim\(\)/, "le detail du motif doit etre transmis au backend");
assert.match(annulationBackendSource, /source === "livreur"[\s\S]*motif_detail/, "le backend doit valider le detail fourni par le livreur");
assert.match(annulationBackendSource, /dispatch_refused_ids:\s*JSON\.stringify\(refusedIds\)/, "le livreur doit etre exclu uniquement de la course annulee");
assert.match(annulationBackendSource, /statut:\s*"en_attente"[\s\S]*dispatch_status:\s*"en_attente"/, "une annulation livreur doit suspendre la course jusqu'a l'action admin");
assert.match(annulationBackendSource, /manual_hors_ligne === true \? "hors_ligne" : "disponible"/, "le livreur doit etre libere sans annuler son choix hors ligne");
assert.match(annulationBackendSource, /ANNULATION CLIENT OU ADMIN[\s\S]*statut:\s*"annulee"[\s\S]*dispatch_status:\s*"expire"/, "une annulation client doit etre terminale et ne jamais rester en attente");
assert.doesNotMatch(annulationBackendSource, /ANNULATION CLIENT OU ADMIN[\s\S]*statut:\s*"en_attente"/, "le chemin client ne doit jamais remettre la course en attente");
assert.match(annulationBackendSource, /livreur_id:\s*livreurId,[\s\S]*user_type:\s*"livreur"[\s\S]*category:\s*"annulation"/, "le livreur concerne doit recevoir le push d'annulation");
assert.match(annulationBackendSource, /entities\.User\.filter\(\{ role: "admin" \}\)[\s\S]*user_type:\s*"admin"[\s\S]*category:\s*"annulation"/, "les admins autorises du pays doivent recevoir le push d'annulation");

console.log("LIVREUR_COURSE_REGRESSION=PASS");
