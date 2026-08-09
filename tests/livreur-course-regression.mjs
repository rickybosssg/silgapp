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

assert.match(livreurAppSource, /id:\s*"disponibles"/, "l'onglet Disponibles doit etre declare");
assert.match(livreurAppSource, /activeTab === "disponibles"/, "l'onglet Disponibles doit etre rendu");
assert.match(livreurAppSource, /<CoursesDisponibles/, "le composant CoursesDisponibles doit etre monte");
assert.match(coursesDisponiblesSource, /\$in:\s*\["disponible_push",\s*"propose",\s*"en_attente"\]/, "la liste V2 doit charger le fil et les propositions compatibles");
assert.match(coursesDisponiblesSource, /country_code:\s*countryCode/, "la liste doit rester isolee par pays");
assert.match(coursesDisponiblesSource, /refusedCourseIds\.includes\(course\.id\)/, "une course refusee ne doit pas reapparaitre");
assert.match(coursesDisponiblesSource, /livreurDisponible/, "un livreur hors ligne ne doit pas charger les courses disponibles");
assert.match(coursesDisponiblesSource, /durationSeconds:\s*5/, "la sonnerie V2 doit durer cinq secondes");
assert.match(coursesDisponiblesSource, /event\.type === "create"/, "une nouvelle course doit rafraichir le fil en temps reel");
assert.match(dispatchSource, /getLivreursRefuses/, "le backend doit verifier les refus persistants");
assert.match(dispatchSource, /isDisponiblePush\s*\?\s*isLivreurDisponible/, "le backend doit autoriser un livreur eligible en mode disponible_push");
assert.match(dispatchSource, /!refusedIds\.includes\(livreur_id\)/, "le backend doit exclure le livreur ayant refuse cette course");

console.log("LIVREUR_COURSE_REGRESSION=PASS");
