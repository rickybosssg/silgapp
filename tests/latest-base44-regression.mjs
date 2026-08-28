import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(join(root, file), "utf8");

const courseEntity = read("base44/entities/CourseExterne.jsonc");
for (const field of [
  "prix_a_confirmer",
  "raison_prix_a_confirmer",
  "prix_suggere_admin",
  "prix_confirme_par_admin_at",
  "prix_confirme_par_admin_id",
]) {
  assert.ok(courseEntity.includes(`\"${field}\"`), `CourseExterne doit contenir ${field}`);
}

const confirmPrice = read("base44/functions/confirmerPrixCourseAdmin/entry.ts");
assert.match(confirmPrice, /user\.role !== 'admin'/, "La confirmation du prix doit être réservée à l'admin");
assert.match(confirmPrice, /Number\.isFinite\(montant\).*montant <= 0/s, "Le montant doit être strictement positif");
assert.match(confirmPrice, /already_confirmed/, "La confirmation doit être idempotente");
assert.match(confirmPrice, /commission_silga: commissionSilga/, "La commission doit être calculée");
assert.match(confirmPrice, /montant_livreur: montantLivreur/, "Le montant livreur doit être calculé");
assert.match(confirmPrice, /invoke\('verifierEncoursLivreur'/, "L'encours doit être comptabilisé par la source canonique");

const venus = read("base44/shared/venusReasoningEngine.ts");
assert.match(venus, /prix_propose_client: cd\.prix_propose/, "VENUS doit stocker le prix côté client");
assert.match(venus, /pricing_mode: 'automatic'/, "VENUS ne doit pas créer un override admin");

const priceCalc = read("base44/functions/calculPrixCourseExterne/entry.ts");
assert.match(priceCalc, /course\.source === 'client'.*course\.pricing_mode === 'admin_manuel'/s, "Le bug historique VENUS doit être détecté");
assert.match(priceCalc, /!course\.prix_propose_admin \|\| course\.created_by_venus/, "Un override admin réel doit rester protégé");
assert.match(priceCalc, /prix_a_confirmer: true/, "Un calcul impossible doit passer en prix à confirmer");

const courseForm = read("src/pages/CourseExterneFormSync.jsx");
assert.match(courseForm, /quartierName: \(formData\.quartier_depart \|\| \"\"\)\.trim\(\)/, "Le quartier de départ doit être normalisé avant GPS");
assert.match(courseForm, /quartierName: \(formData\.quartier_arrivee \|\| \"\"\)\.trim\(\)/, "Le quartier d'arrivée doit être normalisé avant GPS");
assert.match(courseForm, /quartier_depart: \(formData\.quartier_depart \|\| \"\"\)\.trim\(\) \|\| null/, "Le quartier de départ enregistré doit être normalisé");
assert.match(courseForm, /quartier_arrivee: \(formData\.quartier_arrivee \|\| \"\"\)\.trim\(\) \|\| null/, "Le quartier d'arrivée enregistré doit être normalisé");

const restaurantEntity = read("base44/entities/CommandeRestaurant.jsonc");
for (const field of ["preparation_time_minutes", "estimated_ready_at", "dispatch_at"]) {
  assert.ok(restaurantEntity.includes(`\"${field}\"`), `CommandeRestaurant doit contenir ${field}`);
}
const restaurantDispatch = read("base44/functions/dispatchAnticipeRestaurant/entry.ts");
assert.match(restaurantDispatch, /dispatchExterneAuto/, "Le dispatch anticipé doit déléguer au Dispatch V2 existant");
assert.ok(read("src/components/client/SuiviCourseFullscreen.jsx").includes("RestaurantParallelTracking"), "Le suivi parallèle restaurant doit être affiché");

const crm = read("src/lib/crmUtils.js");
assert.match(crm, /getCountryConfig, normalizePhone as normalizePhoneShared/, "Le CRM doit partager la configuration téléphone multi-pays");
assert.match(crm, /telephone_normalized/, "Le CRM doit rechercher le téléphone normalisé");
assert.match(crm, /isPlaceholder/, "Le CRM doit remplacer uniquement les noms placeholders");

const newConversation = read("src/components/chat/NewConversationDialog.jsx");
assert.match(newConversation, /res\?\.data !== undefined \? res\.data : res/, "La messagerie doit accepter les deux formes de réponse SDK");
assert.match(newConversation, /toast\.error/, "Les erreurs doivent être visibles sur Android");
assert.doesNotMatch(newConversation, /\balert\s*\(/, "La messagerie ne doit plus utiliser alert()");

const dashboard = read("src/pages/DashboardExterne.jsx");
assert.ok(
  dashboard.indexOf("const livreurIdsEnCourseReelle = useMemo") < dashboard.indexOf("const livreursEnLigne = useMemo"),
  "DashboardExterne doit initialiser les IDs avant leurs consommateurs",
);

const establishment = read("src/components/partenaire/EtablissementForm.jsx");
assert.doesNotMatch(establishment, /paysConfig\.digits/, "EtablissementForm ne doit plus accéder à .digits");
assert.match(establishment, /phone_min_length/, "EtablissementForm doit utiliser phone_min_length");
assert.match(establishment, /phone_max_length/, "EtablissementForm doit utiliser phone_max_length");
assert.match(establishment, /toast\?\.error/, "Les validations établissement doivent être visibles");

const hotZones = read("base44/functions/detecterZonesChaudes/entry.ts");
assert.match(hotZones, /import \{ haversineKm \} from '\.\.\/\.\.\/shared\/geoUtils\.ts'/, "detecterZonesChaudes doit importer haversineKm sous son vrai nom");
assert.equal((hotZones.match(/haversineKm\(/g) || []).length, 3, "Les trois calculs de zones chaudes doivent utiliser haversineKm");
assert.match(read("base44/shared/geoUtils.ts"), /export function haversineKm\(/, "geoUtils doit exporter haversineKm");

console.log("LATEST_BASE44_REGRESSION=PASS pricing=PASS venus=PASS gps=PASS restaurant=PASS crm=PASS messaging=PASS tdz=PASS establishment=PASS hot_zones=PASS");
