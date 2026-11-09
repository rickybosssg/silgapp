import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = ['src/components/auth/LivreurRegistrationForm.jsx','src/components/admin/DemandesLivreursAdmin.jsx','src/components/admin/DemandesLivreursPanel.jsx','src/components/livreur/LivreurMesInfosModal.jsx','src/pages/PolitiqueConfidentialite.jsx'];
for (const file of files) test(`neutral identity wording: ${file}`, () => {
 const source=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(source,/\bCNIB\b/);
 assert.match(source,/Pi\u00e8ce d'identit\u00e9|pi\u00e8ce d'identit\u00e9/);
});
test('registration retains both images, legacy storage and manual approval',()=>{
 const source=fs.readFileSync(files[0],'utf8');
 for(const fragment of ['if (!cnibRecto || !cnibVerso)', 'photo_cnib_recto_url: rectoUrl || ""', 'photo_cnib_verso_url: versoUrl || ""', 'validation: "en_attente"', 'actif: false', 'accept="image/*"']) assert.ok(source.includes(fragment),fragment);
 assert.match(source,/label="Pi\u00e8ce d'identit\u00e9 \u2014 Recto"[^\n]*required/);
 assert.match(source,/label="Pi\u00e8ce d'identit\u00e9 \u2014 Verso"[^\n]*required/);
});
test('admin document gate and profile storage remain compatible',()=>{
 assert.ok(fs.readFileSync(files[1],'utf8').includes('const docsOk = !!livreur.photo_url && !!livreur.photo_cnib_recto_url && !!livreur.photo_cnib_verso_url;'));
 const profile=fs.readFileSync(files[3],'utf8');
 assert.ok(profile.includes('if (cnibRecto) data.photo_cnib_recto_url = cnibRecto;'));
 assert.ok(profile.includes('if (cnibVerso) data.photo_cnib_verso_url = cnibVerso;'));
});
