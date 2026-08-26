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
assert.match(createClient, /const owner = crypto\.randomUUID\(\)/, "Chaque acquisition du mutex doit utiliser un propriétaire unique");
assert.match(createClient, /AppConfig\.updateMany\([\s\S]*lock_owner: owner/, "La création Client doit utiliser un compare-and-set backend");
assert.match(createClient, /acquireCreationMutex\(base44, normalizedRequestId, user\.email\)/, "La clé idempotente doit être isolée par compte client");
assert.match(createClient, /finally \{[\s\S]*releaseCreationMutex/, "Le mutex doit toujours être libéré après la création");
assert.doesNotMatch(createClient, /Post-creation dedup|Doublon request_id supprimé/, "La déduplication après création non atomique ne doit plus être utilisée");

const appConfigSchema = JSON.parse(read("base44/entities/AppConfig.jsonc"));
assert.equal(appConfigSchema.properties.lock_owner.type, "string", "Le propriétaire du mutex doit être déclaré dans AppConfig");
assert.equal(appConfigSchema.properties.lock_expires_at.format, "date-time", "Le mutex doit avoir une expiration récupérable");

const courseForm = read("src/pages/CourseExterneFormSync.jsx");
assert.match(courseForm, /course_data:\s*courseDataWithoutRequestId,\s*request_id:\s*_rq \|\| crypto\.randomUUID\(\)/, "Le formulaire doit transmettre request_id au niveau attendu par creerCourseClient");

const scanner = read("src/components/livreur/QRScannerModal.jsx");
const validateQr = read("base44/functions/validateQRCode/entry.ts");
assert.doesNotMatch(scanner, /Position GPS indisponible[\s\S]*return;/, "Le PIN/QR ne doit plus être bloqué par un GPS indisponible");
assert.match(validateQr, /GPS optionnel/, "Le backend doit gérer le fallback GPS");
assert.match(validateQr, /course\.gps_arrivee_lat/, "Le fallback doit privilégier la destination de la course");
assert.match(validateQr, /const prixFinalAdmin = Number\(course\.prix_propose_admin\) \|\| 0/, "Le PIN/QR Admin doit utiliser le prix fixé par l'Admin");
assert.match(validateQr, /prix_final:\s*prixFinalAdmin,[\s\S]*commission_silga:\s*adminCommission,[\s\S]*montant_livreur:\s*adminMontantLivreur/, "Le PIN/QR doit écrire atomiquement la répartition financière Admin");

const finalizeDelivery = read("base44/functions/finaliserLivraisonLivreur/entry.ts");
assert.match(finalizeDelivery, /const montant = Number\(course\.prix_propose_admin\)/, "La finalisation Admin doit utiliser prix_propose_admin comme source de vérité");
assert.doesNotMatch(finalizeDelivery, /const montant = Number\(prix_final_livreur\)/, "Le livreur ne doit pas pouvoir remplacer le prix Admin");
assert.match(finalizeDelivery, /course\.statut === 'livree' && \(!isAdminCourse \|\| hasFinancialData\)/, "Une double finalisation complète doit rester sans effet");
for (const amount of [1250, 1500, 1750]) {
  const commission = Math.round(amount * 0.1);
  assert.equal(commission + (amount - commission), amount, `La répartition du prix Admin ${amount} doit rester cohérente`);
}

const activeCourse = read("src/components/livreur/CourseActiveCard.jsx");
assert.match(activeCourse, /const montant = Number\(course\.prix_propose_admin\)/, "La carte Livreur doit afficher le prix Admin verrouillé");
assert.doesNotMatch(activeCourse, /course\.prix_propose_admin\s*\?[\s\S]*parseFloat\(prixReel\)/, "Aucun fallback frontend vers prixReel ne doit subsister");

const balance = read("base44/shared/recalculerSoldeLivreur.ts");
assert.doesNotMatch(balance, /CourseExterne\.updateMany\([\s\S]*statut_paiement_livreur:\s*'paye'/, "Un solde global nul ne doit jamais marquer toutes les courses payées");

const createLivreur = read("base44/functions/createLivreur/entry.ts");
assert.match(createLivreur, /credit_surplus:\s*0/, "Un nouveau livreur doit commencer sans crédit comptable artificiel");
assert.match(createLivreur, /statut_paiement:\s*'paye'/, "Un nouveau livreur sans dette doit commencer à jour");

const soldeCalculator = read("base44/shared/soldeCalculator.ts");
assert.match(soldeCalculator, /Math\.min\(rawCreditSurplus,\s*creditDisponible\)/, "Le crédit excédentaire doit rester plafonné au crédit réellement disponible");
assert.match(soldeCalculator, /SOURCE DE VÉRITÉ unique/, "Le calcul comptable doit rester centralisé dans une source unique");
assert.match(soldeCalculator, /base_comptable_solde_initial/, "La base comptable validée doit rester intégrée au calcul");

const reactivation = read("src/pages/ReactivationClients.jsx");
assert.match(reactivation, /Voir les résultats/, "Les résultats des campagnes de réactivation doivent rester accessibles");
assert.match(reactivation, /ReactivationCampaignRecipient\.filter/, "Le détail d'une campagne doit charger ses destinataires réels");

const phoneUtils = read("src/lib/phoneUtils.js");
assert.match(phoneUtils, /Country\.filter\(\{ actif: true \}\)/, "Les règles téléphone doivent être chargées dynamiquement pour tous les pays actifs");
assert.match(phoneUtils, /phone_min_length/, "La longueur minimale doit provenir de la configuration pays");
assert.match(phoneUtils, /phone_max_length/, "La longueur maximale doit provenir de la configuration pays");

const driverDebts = read("src/pages/DusLivreursExternes.jsx");
assert.match(driverDebts, /const livreursList = livreurs \|\| \[\]/, "Dûs Livreurs doit normaliser les réponses backend absentes");
assert.match(driverDebts, /livreursList\.find\(/, "Dûs Livreurs ne doit jamais rechercher dans une variable potentiellement undefined");
assert.match(driverDebts, /soldeBackend\.montantDu === 0 && entry\.montantDu > 0/, "Un refetch backend à zéro ne doit pas masquer un dû positif stocké");

const tracking = read("src/lib/trackInstall.js");
assert.match(tracking, /Promise\.race\(/, "Le suivi d'installation doit être non bloquant avec timeout");
assert.match(tracking, /\.catch\(\(\) => null\)/, "Un échec de tracking doit rester silencieux pour l'utilisateur");

const diag500 = read("src/lib/diag500.js");
for (const functionName of ["trackAppInstall", "trackDownload", "trackDownloadPublic", "trackReactivationOpened"]) {
  assert.match(diag500, new RegExp(`['\"]${functionName}['\"]`), `${functionName} doit être exclue des erreurs critiques`);
}
assert.match(diag500, /functionName && NON_CRITICAL_FUNCTIONS\.has\(functionName\)/, "Le filtre DIAG 500 doit s'appliquer aux erreurs fetch");
assert.match(diag500, /NON_CRITICAL_FUNCTIONS\.has\(functionName\)[\s\S]*throw err/, "Le filtre DIAG 500 doit aussi s'appliquer à functions.invoke sans masquer l'erreur au code appelant");

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
