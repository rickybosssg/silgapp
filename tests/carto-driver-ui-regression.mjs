import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const cartTiles = read("src/lib/cartTiles.js");
const cartoBackend = read("base44/functions/getCartoConfig/entry.ts");
const main = read("src/main.jsx");
const driverApp = read("src/pages/LivreurExterneApp.jsx");
const driverStats = read("src/components/livreur/LivreurStatsBanner.jsx");
const realtime = read("src/components/livreur/ActiviteTempsReel.jsx");

assert.match(cartoBackend, /\?key=\$\{cartoApiKey\}/, "CARTO doit utiliser le paramètre ?key=");
assert.match(cartTiles, /OSM_FALLBACK_URL/, "Une panne CARTO doit conserver une carte sans clé");
assert.match(cartTiles, /tile\.openstreetmap\.org/, "Le fallback ne doit pas provoquer le watermark CARTO API KEY REQUIRED");
assert.match(main, /await initCartoTiles\(\)/, "CARTO doit être initialisé avant le rendu React");

const mapFiles = [
  "src/components/admin/MapPickerModal.jsx",
  "src/components/carte/DispatchMap.jsx",
  "src/components/chat/CarteLivreurClient.jsx",
  "src/components/client/ModernMap.jsx",
  "src/components/client/RechercheLivreurScreen.jsx",
  "src/components/client/SuiviCourseFullscreen.jsx",
  "src/components/livreur/RouteMiniMap.jsx",
  "src/components/partenaire/PartenaireLocalisation.jsx",
  "src/pages/CarteLivreurs.jsx",
  "src/pages/PublicSuiviCourse.jsx",
];
for (const file of mapFiles) {
  assert.match(read(file), /@\/lib\/cartTiles/, `${file} doit utiliser la source CARTO unique`);
}

for (const directory of ["src", "base44"]) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        const relative = path.relative(root, full).replaceAll("\\", "/");
        if (["src/lib/cartTiles.js", "base44/functions/getCartoConfig/entry.ts"].includes(relative)) continue;
        assert.doesNotMatch(fs.readFileSync(full, "utf8"), /cartocdn\.com/, `${relative} contient une URL CARTO hardcodée`);
      }
    }
  };
  walk(path.join(root, directory));
}

assert.doesNotMatch(driverApp, /<LivreurStatutCard/, "La carte de statut redondante ne doit plus être rendue");
assert.match(driverStats, />Livrées</, "Le nouveau bloc doit afficher les livraisons");
assert.match(driverStats, />Gains</, "Le nouveau bloc doit afficher les gains");
assert.match(driverStats, />À payer à SILGAPP</, "Le nouveau bloc doit afficher le montant à payer à SILGAPP");
assert.match(driverApp, /montantDuSilga !== 0 \? "text-sm" : "text-xs text-slate-500"/, "Payer SILGAPP doit rester discret lorsque le dû est nul");
assert.match(realtime, /eligibleCourses\.length/, "L'activité temps réel doit utiliser la source unique des courses éligibles");
assert.doesNotMatch(realtime, /courses disponibles dans ton rayon/, "Aucun faux rayon ne doit être affiché");

console.log("CARTO_DRIVER_UI_REGRESSION=PASS carto=PASS fallback=PASS driver_ui=PASS");
