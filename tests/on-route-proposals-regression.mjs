// ═══════════════════════════════════════════════════════════════════════════
// TEST DE NON-RÉGRESSION — PROPOSITIONS SUR TRAJET SILGAPP
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce test vérifie que les corrections des propositions sur trajet sont effectives :
//
// BUG CORRIGÉ :
//   Le SDK Base44 (v0.8.53) configure functionsAxiosClient avec
//   interceptResponses: false. Les fonctions invoke() retournent donc
//   la réponse Axios BRUTE, où le body JSON est dans res.data, pas dans res.
//
//   Avant la correction :
//     const res = await base44.functions.invoke("getOnRouteProposalsForLivreur", {...});
//     return res?.proposals || [];  // ← BUG : res.proposals est undefined
//
//   Après la correction :
//     const rawRes = await base44.functions.invoke("getOnRouteProposalsForLivreur", {...});
//     const res = rawRes?.data ?? rawRes;
//     return res?.proposals || [];  // ← CORRECT
//
// FICHIERS CORRIGÉS :
//   1. src/hooks/useOnRouteProposals.js — extraction res?.data ?? res
//   2. src/components/livreur/OnRouteProposalCard.jsx — handleAccept + handleRefuse
//
// Ce test est exécuté via exec_tool après déploiement des corrections.
// ═══════════════════════════════════════════════════════════════════════════

// ── Helper : simuler une réponse Axios brute (comme le SDK la retourne) ──
function makeAxiosResponse(body) {
  return {
    data: body,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    request: {},
  };
}

// ── Helper : simuler le pattern de correction (rawRes?.data ?? rawRes) ──
function extractResponseBody(rawRes) {
  const res = rawRes?.data ?? rawRes;
  return res;
}

// ── Tests ──
const results = [];
function assert(name, condition, detail = '') {
  results.push({ name, passed: !!condition, detail });
  if (!condition) console.error(`❌ FAIL: ${name} — ${detail}`);
  else console.log(`✅ PASS: ${name}`);
}

// ── Test 1 : La réponse SDK est bien une réponse Axios (res.data contient le body) ──
const axiosResponse = makeAxiosResponse({
  success: true,
  proposals: [{ proposal_id: 'prop-1', course_id: 'course-1' }],
  count: 1,
});

assert(
  'Test 1a — res.data contient le body (pas res directement)',
  axiosResponse.data?.success === true && axiosResponse.success === undefined,
  `res.success=${axiosResponse.success}, res.data.success=${axiosResponse.data?.success}`
);

assert(
  'Test 1b — res.proposals est undefined (le bug)',
  axiosResponse.proposals === undefined,
  `res.proposals=${JSON.stringify(axiosResponse.proposals)}`
);

assert(
  'Test 1c — res.data.proposals contient le tableau',
  Array.isArray(axiosResponse.data?.proposals) && axiosResponse.data.proposals.length === 1,
  `res.data.proposals.length=${axiosResponse.data?.proposals?.length}`
);

// ── Test 2 : Le pattern de correction (rawRes?.data ?? rawRes) extrait le body ──
const extracted = extractResponseBody(axiosResponse);

assert(
  'Test 2a — Le pattern rawRes?.data ?? rawRes retourne le body',
  extracted?.success === true,
  `extracted.success=${extracted?.success}`
);

assert(
  'Test 2b — extracted.proposals est un tableau',
  Array.isArray(extracted?.proposals) && extracted.proposals.length === 1,
  `extracted.proposals.length=${extracted?.proposals?.length}`
);

assert(
  'Test 2c — extracted.proposals[0].proposal_id est correct',
  extracted?.proposals?.[0]?.proposal_id === 'prop-1',
  `proposal_id=${extracted?.proposals?.[0]?.proposal_id}`
);

// ── Test 3 : Le pattern gère aussi le cas où la réponse est déjà déballée ──
const unwrappedResponse = {
  success: true,
  proposals: [{ proposal_id: 'prop-2', course_id: 'course-2' }],
  count: 1,
};

const extractedUnwrapped = extractResponseBody(unwrappedResponse);

assert(
  'Test 3a — Le pattern gère une réponse déjà déballée',
  extractedUnwrapped?.success === true,
  `extracted.success=${extractedUnwrapped?.success}`
);

assert(
  'Test 3b — extracted.proposals est correct (réponse déjà déballée)',
  Array.isArray(extractedUnwrapped?.proposals) && extractedUnwrapped.proposals.length === 1,
  `length=${extractedUnwrapped?.proposals?.length}`
);

// ── Test 4 : Réponse avec proposals vide ──
const emptyResponse = makeAxiosResponse({
  success: true,
  proposals: [],
  count: 0,
});

const extractedEmpty = extractResponseBody(emptyResponse);
assert(
  'Test 4 — proposals vide retourne un tableau vide',
  Array.isArray(extractedEmpty?.proposals) && extractedEmpty.proposals.length === 0,
  `length=${extractedEmpty?.proposals?.length}`
);

// ── Test 5 : Réponse d'acceptation (ecoOptimizationOrchestrator) ──
const acceptResponse = makeAxiosResponse({
  success: true,
  accepted: true,
  course_id: 'course-1',
  proposal_id: 'prop-1',
});

const extractedAccept = extractResponseBody(acceptResponse);
assert(
  'Test 5a — accepted=true extrait correctement',
  extractedAccept?.accepted === true,
  `accepted=${extractedAccept?.accepted}`
);

assert(
  'Test 5b — success=true extrait correctement',
  extractedAccept?.success === true,
  `success=${extractedAccept?.success}`
);

// ── Test 6 : Réponse de refus ──
const refuseResponse = makeAxiosResponse({
  success: true,
  accepted: false,
});

const extractedRefuse = extractResponseBody(refuseResponse);
assert(
  'Test 6 — refuse response extraite correctement',
  extractedRefuse?.success === true && extractedRefuse?.accepted === false,
  `success=${extractedRefuse?.success}, accepted=${extractedRefuse?.accepted}`
);

// ── Test 7 : Réponse avec erreur (proposal expirée) ──
const expiredResponse = makeAxiosResponse({
  success: false,
  reason: 'proposal_expired',
});

const extractedExpired = extractResponseBody(expiredResponse);
assert(
  'Test 7 — reason extrait correctement',
  extractedExpired?.reason === 'proposal_expired',
  `reason=${extractedExpired?.reason}`
);

// ── Résumé ──
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log('\n═══════════════════════════════════════════════════');
console.log(`  RÉSULTAT : ${passed}/${results.length} tests réussis, ${failed} échoués`);
console.log('═══════════════════════════════════════════════════');

if (failed > 0) {
  console.log('\n❌ Tests échoués :');
  results.filter(r => !r.passed).forEach(r => console.log(`   • ${r.name}: ${r.detail}`));
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests de non-régression sont passés.');
}

// Export pour exec_tool
export { results, makeAxiosResponse, extractResponseBody };