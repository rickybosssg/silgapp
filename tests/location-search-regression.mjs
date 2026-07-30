import assert from "node:assert/strict";
import {
  filterAndRankLocations,
  mergeLocationResults,
  normalizeLocationText,
} from "../src/lib/locationSearchCore.js";

const bf = [
  { id: "q1", type: "quartier", label: "Karpala", searchText: "Karpala Est" },
  { id: "q2", type: "quartier", label: "Karpala Sud", searchText: "Karpala-Sud" },
  { id: "p1", type: "pharmacie", label: "Pharmacie Saint Camille", searchText: "Dassasgho Ouagadougou" },
  { id: "m1", type: "adresse", label: "Marché de Sankariaré", searchText: "Sankariare Ouagadougou" },
];

const ci = [
  { id: "ci1", type: "quartier", label: "Cocody", searchText: "Abidjan Côte d'Ivoire" },
];

assert.equal(normalizeLocationText("  Côte-d’Ivoire "), "cote d ivoire");
assert.deepEqual(filterAndRankLocations(bf, "Kar").slice(0, 2).map((item) => item.id), ["q1", "q2"]);
assert.equal(filterAndRankLocations(bf, "phar")[0].id, "p1");
assert.equal(filterAndRankLocations(bf, "Sankariaré")[0].id, "m1");
assert.equal(filterAndRankLocations(ci, "Kar").length, 0, "A country-specific index must not leak results");

const merged = mergeLocationResults(
  [{ id: "a", type: "quartier", label: "Karpala", latitude: 12.3, longitude: -1.4 }],
  [{ id: "b", type: "adresse", label: "Karpala", latitude: 12.3, longitude: -1.4 }],
);
assert.equal(merged.length, 1, "Same coordinates must be deduplicated");

console.log("LOCATION_SEARCH_TESTS=7");
console.log("LOCATION_SEARCH_RESULT=PASS");
