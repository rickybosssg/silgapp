import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shouldPush } from "../base44/shared/venusAdminPushEngine.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const clientButton = read("src/components/client/VenusFloatingButton.jsx");
assert.match(clientButton, /user\?\.role === "admin"/, "Le bouton partagé doit détecter explicitement le rôle Admin");
assert.match(clientButton, /showChat && isAdmin && <VenusAdminPanel/, "Un Admin doit ouvrir VenusAdminPanel");
assert.match(clientButton, /showChat && !isAdmin && <VenusChat/, "Les autres rôles doivent conserver VENUS classique");
assert.match(clientButton, /useVenusAdminNotifications\(isAdmin\)/, "Les événements Admin doivent être désactivés pour les autres rôles");

const adminLayout = read("src/components/layout/AppLayout.jsx");
assert.match(adminLayout, /VenusFloatingButton/, "Le layout Admin doit charger le bouton VENUS Base44 partagé");

for (const functionPath of [
  "base44/functions/venusAdminChat/entry.ts",
  "base44/functions/venusAdminIntelligence/entry.ts",
  "base44/functions/genererRapportVenus/entry.ts",
]) {
  const source = read(functionPath);
  assert.match(source, /currentUser\.role !== ['"]admin['"]/, `${functionPath} doit refuser les non-admins`);
  assert.match(source, /status:\s*403/, `${functionPath} doit retourner HTTP 403 aux non-admins`);
}

for (const entityPath of [
  "base44/entities/VenusAdminEvent.jsonc",
  "base44/entities/VenusRapport.jsonc",
  "base44/entities/AdminInboxItem.jsonc",
]) {
  const schema = JSON.parse(read(entityPath));
  for (const operation of ["read", "create", "update", "delete"]) {
    assert.equal(schema.rls?.[operation]?.user_condition?.role, "admin", `${entityPath}: RLS ${operation} doit être limitée au rôle admin`);
  }
}

const adminToast = read("src/components/admin/VenusAdminToast.jsx");
assert.match(adminToast, /createPortal\(/, "Le toast Admin doit être rendu dans un portal document.body");
assert.match(adminToast, /document\.body/, "Le toast Admin doit être détaché des transforms parents");
assert.doesNotMatch(adminToast, /scale:\s*/, "Le toast Admin ne doit pas réintroduire de transform scale");

const adminInboxPage = read("src/pages/CentreNotifications.jsx");
assert.match(adminInboxPage, /useEffect\(\(\) => \{[\s\S]*AdminInboxItem\.subscribe/, "La subscription Inbox doit être gérée par un effet React");
assert.match(adminInboxPage, /return \(\) => unsubscribe\?\.\(\)/, "La subscription Inbox doit être nettoyée au démontage");
assert.match(adminInboxPage, /navigate\(item\.action_url\)/, "Le Centre Admin doit ouvrir les deep links persistés");
assert.doesNotMatch(adminInboxPage, /AdminInboxItem\.bulkUpdate/, "Le marquage global ne doit pas dépendre d'une méthode SDK non vérifiée");

const eventBus = read("base44/shared/venusAdminEventBus.ts");
assert.match(eventBus, /source_id:\s*venusEvent\?\.id/, "AdminInboxItem doit référencer le vrai VenusAdminEvent");

const pushFunction = read("base44/functions/envoiNotificationPush/entry.ts");
assert.match(pushFunction, /inbox_item_id:\s*String\(inboxItemId/, "Le payload FCM Admin doit contenir inbox_item_id");

const messageFunction = read("base44/functions/envoyerMessage/entry.ts");
assert.match(messageFunction, /deduplication_key:\s*`INBOX_MSG_\$\{message\.id\}_\$\{admin\.email\}`/, "Les messages Admin doivent être dédupliqués par message et destinataire");
assert.equal((messageFunction.match(/createAdminInboxItem\(/g) || []).length, 1, "Un message Admin ne doit créer l'Inbox qu'une seule fois");
assert.match(messageFunction, /inbox_item_id:\s*adminInboxIds\.get\(r\.email\)/, "Le push message Admin doit réutiliser l'Inbox existante");

assert.equal(shouldPush({ id: "p0", type: "test", priority: "haute", observation: "P0" }), true);
assert.equal(shouldPush({ id: "p1", type: "test", priority: "moyenne", observation: "P1" }), true);
assert.equal(shouldPush({ id: "p2", type: "test", priority: "basse", observation: "P2" }), false);

console.log("VENUS_ADMIN_REGRESSION=PASS isolation=PASS rls=PASS backend=PASS push_p0_p1=PASS");
