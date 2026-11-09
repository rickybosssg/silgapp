// Presentation-only redesign: fingerprints captured from the dirty pre-change source.
// Intentional future behavior changes require explicit review of these baselines.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {parse} from '@babel/parser';
function normalized(src){const ast=parse(src,{sourceType:'module',plugins:['jsx']});function clean(x){if(!x||typeof x!=='object')return x;if(Array.isArray(x))return x.map(clean);if(x.type==='JSXAttribute'&&['className','inputClassName'].includes(x.name?.name))return {type:'PresentationClass'};if(x.type==='VariableDeclarator'&&['inputClass','labelClass'].includes(x.id?.name))return {type:'PresentationVariable',name:x.id.name};return Object.fromEntries(Object.entries(x).filter(([k])=>!['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(k)).map(([k,v])=>[k,clean(v)]));}return clean(ast);}
const baselines={
  "src/components/auth/AuthGate.jsx": "eb21692019579e4afaba2f10cc1be1209ac50ce046266aa24106cfdb705588d1",
  "src/pages/RoleSelection.jsx": "8167750a1be3f772d8acacdc510f420aea34269180708142602c2e92e7407910",
  "src/components/client/ClientOnboarding.jsx": "6e9e6bbaedf7500d1971955d682d366de15046343547f02e6eff92826094a39b",
  "src/components/auth/ClientOnboardingForm.jsx": "ae94ffe0f1acb8ae00931ee402c28175d4b1710a2ad6221c99c62be1fd7aa9d4",
  "src/components/auth/LivreurRegistrationForm.jsx": "6292f28aa072dd7436abc1c9d0bee01989d1b31fd7b7322e1c1738dd89849679"
};
for(const [file,expected] of Object.entries(baselines))test(file+' preserves handlers, fields, validation, messages and rendering conditions',()=>{assert.equal(crypto.createHash('sha256').update(JSON.stringify(normalized(fs.readFileSync(file,'utf8')))).digest('hex'),expected);});
test('small-screen forms retain single-column fallback and keyboard-visible upload focus',()=>{for(const file of ['src/components/client/ClientOnboarding.jsx','src/components/auth/LivreurRegistrationForm.jsx'])assert.ok(fs.readFileSync(file,'utf8').includes('grid-cols-1 min-[400px]:grid-cols-2'));const driver=fs.readFileSync('src/components/auth/LivreurRegistrationForm.jsx','utf8');assert.ok(driver.includes('className="sr-only"'));assert.ok(driver.includes('focus-within:ring-4'));});
