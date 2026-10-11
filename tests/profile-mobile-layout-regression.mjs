import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/client/ProfilModal.jsx',import.meta.url),'utf8');
assert.match(source,/min-w-0 max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
assert.match(source,/className="flex-1 min-w-0 w-0 h-12/);
assert.match(source,/onChange=\{handleTelChange\}/);
assert.match(source,/ClientExterne\.update\(clientProfil\.id/);
console.log('PROFILE_MOBILE_LAYOUT=PASS (source regression, not rendered-device proof)');
