import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const refaireButton = read('src/components/client/RefaireCourseButton.jsx');
assert.match(refaireButton, /country_code:\s*course\.country_code\s*\|\|\s*clientProfil\?\.country_code\s*\|\|\s*""/);
assert.match(refaireButton, /country_code:\s*prefillData\.country_code/);
assert.match(refaireButton, /prix_propose:\s*Number\(course\.prix_propose_client\s*\|\|\s*course\.prix_final\s*\|\|\s*0\)/);

const clientForm = read('src/pages/CourseExterneFormSync.jsx');
assert.match(clientForm, /const normalizeCountryCode =/);
assert.match(clientForm, /prefillCourse\?\.country_code/);
assert.match(clientForm, /const effectiveCountryCode = normalizeCountryCode/);
assert.match(clientForm, /if \(currentStep !== totalSteps - 1\)/);
assert.match(clientForm, /const prixClientValide = isMulti \? 0 : Number\(formData\.prix_propose \|\| 0\)/);
assert.match(clientForm, /prix_propose_client:\s*prixClientValide/);

const stepForm = read('src/components/client/CourseStepForm.jsx');
assert.doesNotMatch(stepForm, /prix_propose:\s*tarif\.prix/);
assert.doesNotMatch(stepForm, /prix_propose:\s*estimation\.prix/);
assert.match(stepForm, /disabled=\{isLoading \|\| isContinueDisabled\}/);
assert.match(stepForm, /const prix = Number\(formData\.prix_propose \|\| 0\)/);
assert.match(stepForm, /return !Number\.isFinite\(prix\) \|\| prix <= 0/);

const finaliser = read('base44/functions/finaliserLivraisonLivreur/entry.ts');
const prixClientBranch = finaliser.indexOf('const prixClientExplicite = resolveClientExplicitPrice(course, prix_final_livreur);');
const delegatedCalc = finaliser.indexOf("functions.invoke('calculPrixCourseExterne'");
assert.ok(prixClientBranch > 0, 'explicit client price branch missing');
assert.ok(delegatedCalc > prixClientBranch, 'explicit client price must be handled before calculPrixCourseExterne');
assert.match(finaliser, /function parsePositiveMoney/);
assert.ok(finaliser.includes("String(value).replace(/[^\\d]/g, '')"));
assert.match(finaliser, /course\?\.source === 'client'[\s\S]*parsePositiveMoney\(course\?\.prix_propose\)/);
assert.match(finaliser, /const isPublicClientStandard = course\?\.source === 'client'/);
assert.match(finaliser, /prix_final:\s*prixClientExplicite/);
assert.match(finaliser, /prix_source:\s*'prix_propose_client_explicit'/);
assert.match(finaliser, /tauxCommissionEffectif\(course,\s*commissionPct\)/);
assert.match(finaliser, /zeroCommissionFields\(course\)/);
assert.match(finaliser, /verifierEncoursLivreur', \{ course_id \}/);

const calculPrix = read('base44/functions/calculPrixCourseExterne/entry.ts');
assert.doesNotMatch(calculPrix, /const prixRetenu = course\.prix_final \|\| course\.prix_propose_client/);
assert.match(calculPrix, /course\.statut === 'livree'/);
assert.match(calculPrix, /const prixClientExplicite = parsePositiveMoney\(course\.prix_propose_client\)/);

const activeCard = read('src/components/livreur/CourseActiveCard.jsx');
assert.doesNotMatch(activeCard, /Prix final calculé à la livraison selon le tarif du pays/);
assert.match(activeCard, /Prix proposé par le client, conservé à la livraison/);
assert.match(activeCard, /prix_final_livreur:\s*getPrixAffichable\(course\)/);

const transition = read('base44/functions/transitionStatutLivreur/entry.ts');
const forbiddenStart = transition.indexOf('const FORBIDDEN_FIELDS = [');
const forbiddenEnd = transition.indexOf('];', forbiddenStart);
const forbiddenBlock = transition.slice(forbiddenStart, forbiddenEnd);
assert.doesNotMatch(forbiddenBlock, /pickup_confirmed_by/);
assert.match(transition, /pickup_confirmed_by = confirmation_method === 'bouton' \? 'bouton' : 'livreur'/);

console.log('PASS: physical 1.0.108 regressions guarded (country, no premature creation, exact client price, delivery).');
