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
assert.match(coursesDisponiblesSource, /\$in:\s*\["disponible_push",\s*"propose",\s*"en_attente"\]/, "la liste V2 doit charger le fil et les propositions compatibles");
assert.match(coursesDisponiblesSource, /country_code:\s*countryCode/, "la liste doit rester isolee par pays");
assert.match(coursesDisponiblesSource, /refusedCourseIds\.includes\(course\.id\)/, "une course refusee ne doit pas reapparaitre");
assert.match(coursesDisponiblesSource, /livreurDisponible/, "un livreur hors ligne ne doit pas charger les courses disponibles");
assert.match(coursesDisponiblesSource, /durationSeconds:\s*10/, "la sonnerie V2 doit durer dix secondes");
assert.match(coursesDisponiblesSource, /action:\s*"accepter_course_v2"/, "l'acceptation doit utiliser le verrou V2 compatible avec en_attente");
assert.match(coursesDisponiblesSource, /persistDismissedCourse\(course\.id\)/, "un refus doit rester masque apres navigation");
assert.match(coursesDisponiblesSource, /event\.type === "create"/, "une nouvelle course doit rafraichir le fil en temps reel");
assert.match(dispatchSource, /getLivreursRefuses/, "le backend doit verifier les refus persistants");
assert.match(dispatchSource, /isDisponiblePush\s*\?\s*isLivreurDisponible/, "le backend doit autoriser un livreur eligible en mode disponible_push");
assert.match(dispatchSource, /!refusedIds\.includes\(livreur_id\)/, "le backend doit exclure le livreur ayant refuse cette course");
const dispatchV2Source = readFileSync(
  new URL("../base44/shared/dispatchV2.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(dispatchV2Source, /dispatch_status:[^\n]+livreur_id:\s*''/, "le verrou V2 doit accepter un livreur_id null");
assert.match(nativePushSource, /DISPATCH_V2_ALERT_DURATION_MS\s*=\s*10000L/, "l'alerte native V2 doit durer dix secondes");
assert.match(nativePushSource, /playNotificationSound\(context, false\)/, "la sonnerie native V2 ne doit pas boucler");

console.log("LIVREUR_COURSE_REGRESSION=PASS");
