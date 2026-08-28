import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(join(root, file), "utf8");

const variables = read("android/variables.gradle");
assert.match(variables, /compileSdkVersion\s*=\s*36\b/, "compileSdk doit cibler Android 16/API 36");
assert.match(variables, /targetSdkVersion\s*=\s*36\b/, "targetSdk doit cibler Android 16/API 36");
assert.match(variables, /minSdkVersion\s*=\s*23\b/, "La compatibilite minimale Android doit rester API 23");

const manifest = read("android/app/src/main/AndroidManifest.xml");
assert.match(manifest, /android:enableOnBackInvokedCallback="false"/, "Le comportement Retour Capacitor 5 doit etre preserve sur Android 16");
assert.match(manifest, /android:foregroundServiceType="location"/, "Le service GPS doit conserver le type location");
assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/, "La permission foreground location doit rester declaree");
assert.doesNotMatch(manifest, /android\.permission\.(?:READ_MEDIA_IMAGES|READ_MEDIA_VIDEO|USE_EXACT_ALARM|SCHEDULE_EXACT_ALARM)/, "Les permissions media globales et alarmes exactes ne doivent pas revenir");

const html = read("index.html");
assert.match(html, /viewport-fit=cover/, "La WebView doit exposer les safe areas edge-to-edge");

const css = read("src/index.css");
assert.match(css, /safe-area-inset-top/, "La safe area haute doit etre geree");
assert.match(css, /safe-area-inset-bottom/, "La safe area basse doit etre geree");

const mainActivity = read("android/app/src/main/java/com/silgapp2/app/MainActivity.java");
assert.match(mainActivity, /extends BridgeActivity/, "MainActivity doit rester une BridgeActivity Capacitor");

console.log("ANDROID_API36_REGRESSION=PASS compile=36 target=36 min=23 back=preserved edge_to_edge=prepared fgs_location=preserved");
