import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/livreur/CourseActiveCard.jsx', import.meta.url), 'utf8');
const expression = source.match(/const isAdminColisCourse = ([\s\S]*?);/)[1];
const evaluate = new Function('course', 'isDeplacement', 'isPartnerCourse', `return ${expression};`);
for (const delivery_mode of ['standard', 'eco']) {
  assert.equal(evaluate({ source: 'client', pricing_mode: 'manual', delivery_mode }, false, false), false);
  assert.equal(evaluate({ source: 'admin', delivery_mode }, false, false), true);
  assert.equal(evaluate({ pricing_mode: 'admin_manuel', delivery_mode }, false, false), true);
}
assert.equal(evaluate({}, false, false), false);
assert.equal(evaluate({ source: 'admin' }, true, false), false);
assert.equal(evaluate({ source: 'admin' }, false, true), false);
assert.match(source, /isClientContactePhase = isAdminColisCourse && effectiveStatut === "livreur_en_route"/);
assert.match(source, /isExterne && !course\.is_multi_colis/);
console.log('PASS client/admin contact phase: Standard, Eco, legacy, displacement, partner');
