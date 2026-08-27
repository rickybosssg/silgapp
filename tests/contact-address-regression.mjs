import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(join(root, file), "utf8");

const contactSource = read("src/lib/courseContact.js");
const executableContactSource = contactSource
  .replace(/^import .*?;\r?\n/, "")
  .replaceAll("export function ", "function ")
  .concat("\nthis.getCourseContactForPhase = getCourseContactForPhase;");
const context = { normalizePhone: (phone, country) => `${country}:${String(phone).replace(/\D/g, "")}` };
vm.runInNewContext(executableContactSource, context);
const getContact = context.getCourseContactForPhase;

const clientCourse = {
  type_course: "expedier",
  expediteur_telephone: "70000001",
  expediteur_nom: "Expediteur QA",
  destinataire_telephone: "70000002",
  destinataire_nom: "Destinataire QA",
  contact_createur_course: "70000003",
};
assert.equal(getContact(clientCourse, "recuperation").telephone, "70000001");
assert.equal(getContact(clientCourse, "livraison").telephone, "70000002");

const recevoirCourse = { ...clientCourse, type_course: "recevoir" };
assert.equal(getContact(recevoirCourse, "recuperation").telephone, "70000001");
assert.equal(getContact(recevoirCourse, "livraison").telephone, "70000002");

const adminCourse = { ...clientCourse, source: "admin" };
assert.equal(getContact(adminCourse, "recuperation").telephone, "70000003");
assert.equal(getContact(adminCourse, "livraison").telephone, "70000003");

const deplacement = {
  type_course: "deplacement",
  passager_telephone: "70000004",
  passager_nom: "Passager QA",
  contact_createur_course: "70000005",
};
assert.equal(getContact(deplacement, "recuperation").telephone, "70000004");
assert.equal(getContact(deplacement, "livraison").telephone, "70000004");

assert.match(contactSource, /return normalizePhone\(num, countryCode\) \|\| num/, "WhatsApp doit utiliser la normalisation téléphone multi-pays");

const activeCard = read("src/components/livreur/CourseActiveCard.jsx");
assert.match(activeCard, /const contact = getCourseContactForPhase\(course, phase\)/, "La carte active doit utiliser la source de contact unique");
assert.match(activeCard, /href=\{`tel:\$\{contactTel\}`\}/, "Appeler doit utiliser le contact sélectionné");
assert.match(activeCard, /normalizePhoneForWhatsapp\(contactTel, course\.country_code\)/, "WhatsApp doit utiliser le même contact sélectionné");
assert.match(activeCard, /destinataireTelephone=\{getCourseContactForPhase\(course, "recuperation"\)\.telephone\}/, "Le GPS récupération doit suivre l'expéditeur sélectionné");
assert.match(activeCard, /destinataireTelephone=\{getCourseContactForPhase\(course, "livraison"\)\.telephone\}/, "Le GPS livraison doit suivre le destinataire sélectionné");

const waitingModal = read("src/components/livreur/CourseEnAttenteModal.jsx");
assert.match(waitingModal, /getCourseContactForPhase\(course, "recuperation"\)/, "Le modal doit afficher le contact de récupération");
assert.match(waitingModal, /href=\{`tel:\$\{contact\.telephone\}`\}/, "Le modal Appeler doit utiliser le contact unique");
assert.match(waitingModal, /normalizePhoneForWhatsapp\(contact\.telephone, course\.country_code\)/, "Le modal WhatsApp doit utiliser le même contact");

const autocompleteFiles = [
  "src/components/location/SmartAddressInput.jsx",
  "src/components/client/AddressAutocomplete.jsx",
  "src/components/admin/AdminAddressAutocomplete.jsx",
  "src/components/client/QuartierSelect.jsx",
];
for (const file of autocompleteFiles) {
  const source = read(file);
  assert.match(source, /onPointerDown=.*preventDefault\(\)/, `${file} doit préserver le premier toucher avant le blur`);
  if (file.endsWith("SmartAddressInput.jsx")) {
    assert.match(source, /onSelect\?\.\(item\)/, `${file} doit transmettre l'objet suggestion avec ses coordonnées`);
  } else if (file.endsWith("QuartierSelect.jsx")) {
    assert.match(source, /onGpsSelect\(\{ lat: quartier\.latitude, lng: quartier\.longitude \}\)/, `${file} doit transmettre les coordonnées sélectionnées`);
  } else {
    assert.match(source, /latitude:/, `${file} doit transmettre la latitude sélectionnée`);
    assert.match(source, /longitude:/, `${file} doit transmettre la longitude sélectionnée`);
  }
}
for (const file of ["src/components/location/SmartAddressInput.jsx", "src/components/admin/AdminAddressAutocomplete.jsx"]) {
  assert.match(read(file), /justSelectedRef/, `${file} doit empêcher la réouverture parasite après sélection`);
}

const dashboardSource = read("src/pages/DashboardExterne.jsx");
const idsDeclaration = dashboardSource.indexOf("const livreurIdsEnCourseReelle = useMemo");
const onlineDeclaration = dashboardSource.indexOf("const livreursEnLigne = useMemo");
assert.ok(idsDeclaration >= 0, "DashboardExterne doit déclarer livreurIdsEnCourseReelle");
assert.ok(onlineDeclaration >= 0, "DashboardExterne doit déclarer livreursEnLigne");
assert.ok(idsDeclaration < onlineDeclaration, "livreurIdsEnCourseReelle doit être initialisé avant livreursEnLigne pour éviter la TDZ");

console.log("CONTACT_ADDRESS_REGRESSION=PASS contacts=PASS whatsapp=PASS gps=PASS first_tap=PASS coordinates=PASS dashboard_tdz=PASS");
