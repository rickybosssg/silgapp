import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const clientForm = read("src/pages/CourseExterneFormSync.jsx");
assert.match(clientForm, /createResult\?\.data\?\.course \|\| createResult\?\.course/, "La réponse Base44 doit accepter les deux formes SDK");
assert.match(clientForm, /notifyClientSync[\s\S]*\.catch\(\(\) => null\)/, "La notification ne doit pas bloquer la confirmation client");
assert.match(clientForm, /dispatchExterneAuto[\s\S]*\.catch\(\(\) => null\)/, "Le dispatch doit démarrer en arrière-plan");
assert.match(clientForm, /Course créée — En attente d’un livreur/, "Le client doit voir la confirmation immédiate attendue");
const handleSubmit = clientForm.slice(clientForm.indexOf("const handleSubmit"), clientForm.indexOf("const handleNext"));
assert.ok(handleSubmit.indexOf("const isMulti") < handleSubmit.indexOf("const arriveeGps = isMulti"), "isMulti doit être déclaré avant son premier usage métier");
assert.match(handleSubmit, /createMutation\.mutate\(\{/, "Une soumission valide doit atteindre la mutation de création");
assert.match(handleSubmit, /submissionSafetyTimerRef\.current = setTimeout\([\s\S]*30000\)/, "Le filet de sécurité de 30 secondes doit rester actif");
assert.match(clientForm, /const resetSubmission = \(\) => \{[\s\S]*clearTimeout\(submissionSafetyTimerRef\.current\)/, "Le timer doit être annulé lorsque la soumission se termine");
assert.doesNotMatch(clientForm, /c\.id !== `temp_\$\{Date\.now\(\)\}`/, "Le brouillon optimiste doit être supprimé avec son vrai préfixe, pas un nouvel horodatage");

const adminDashboard = read("src/pages/DashboardAdminExterne.jsx");
assert.match(adminDashboard, /selectedCountry/, "Le dashboard Admin global doit suivre le pays sélectionné");
assert.match(adminDashboard, /isPays \? adminCountryCode : \(selectedCountry \|\| "BF"\)/, "Le fallback BF ne doit s'appliquer qu'en l'absence de sélection");

const adminCourseForm = read("src/pages/AdminCourseForm.jsx");
assert.doesNotMatch(adminCourseForm, /TRACE clientTelephone|setClientTelephoneRaw/, "Aucun traceur temporaire ne doit partir en production");
assert.match(adminCourseForm, /type="tel"[\s\S]*inputMode="tel"/, "Le téléphone Admin doit utiliser le clavier natif adapté");
assert.match(adminCourseForm, /functions\.invoke\(['"]creerCourseAdmin['"]/, "La création Admin doit passer par le backend sécurisé");

const userSchema = JSON.parse(read("base44/entities/User.jsonc"));
assert.ok(userSchema.properties.silgapp_role.enum.includes("agent_saisie"), "Le rôle agent de saisie doit être déclaré");
assert.equal(userSchema.properties.can_create_admin_course.type, "boolean", "La permission dédiée doit être booléenne");
for (const country of ["BF", "BJ", "CI", "TG", "SN", "GH", "NG"]) {
  assert.ok(userSchema.properties.country_code.enum.includes(country), `Le pays ${country} doit être accepté pour un Admin pays`);
}

const createAdmin = read("base44/functions/creerCourseAdmin/entry.ts");
assert.match(createAdmin, /user\.role === 'admin' \|\| user\.can_create_admin_course === true/, "Le backend doit vérifier la permission agent");

const createClient = read("base44/functions/creerCourseClient/entry.ts");
assert.match(createClient, /cleanData\.country_code = String\(cleanData\.country_code\)\.trim\(\)\.toUpperCase\(\)/, "Le backend Client doit conserver un country_code normalisé");
assert.match(createClient, /cleanData\.statut = 'nouvelle'/, "Le backend doit créer la course dans l'état initial nouvelle");
assert.match(createClient, /cleanData\.dispatch_status = 'en_attente'/, "Le backend doit initialiser le dispatch de façon déterministe");

const courseForm = read("src/pages/CourseExterneFormSync.jsx");
assert.match(courseForm, /course_data:\s*courseDataWithoutRequestId,\s*request_id:\s*_rq \|\| crypto\.randomUUID\(\)/, "Le formulaire doit transmettre request_id au niveau attendu par creerCourseClient");

const scanner = read("src/components/livreur/QRScannerModal.jsx");
const validateQr = read("base44/functions/validateQRCode/entry.ts");
assert.doesNotMatch(scanner, /Position GPS indisponible[\s\S]*return;/, "Le PIN/QR ne doit plus être bloqué par un GPS indisponible");
assert.match(validateQr, /GPS optionnel/, "Le backend doit gérer le fallback GPS");
assert.match(validateQr, /course\.gps_arrivee_lat/, "Le fallback doit privilégier la destination de la course");

const balance = read("base44/shared/recalculerSoldeLivreur.ts");
assert.doesNotMatch(balance, /CourseExterne\.updateMany\([\s\S]*statut_paiement_livreur:\s*'paye'/, "Un solde global nul ne doit jamais marquer toutes les courses payées");

const messages = read("src/components/chat/MessagesPage.jsx");
assert.match(messages, /myType === "admin"[\s\S]*normalizeParticipantType\(p\?\.type\) === "admin"/, "L'Admin doit voir toutes ses conversations, y compris support historique");

const app = read("src/App.jsx");
assert.match(app, /const CentreNotificationsPush = lazy/, "La route Push Admin doit importer son composant");
assert.match(app, /silgapp:notification-opened/, "Les deep links Admin existants doivent être conservés");

const directWrites = [];
const scan = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      scan(path);
    } else if ([".js", ".jsx", ".ts", ".tsx"].includes(extname(path))) {
      const source = readFileSync(path, "utf8");
      if (/CourseExterne\.(?:create|update|delete)\(/.test(source)) directWrites.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
};
scan(join(root, "src"));
assert.deepEqual(directWrites, ["src/pages/ToutesCoursesExternes.jsx"], "Seule la priorité Admin peut encore écrire directement dans CourseExterne");

console.log("BASE44_SYNC_REGRESSION=PASS multipays=PASS admin=PASS client=PASS livreur=PASS accounting=PASS messaging=PASS");
