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

console.log("LIVREUR_COURSE_REGRESSION=PASS");
