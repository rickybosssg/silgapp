import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Keep runtime/tenant protections; obsolete release-specific diff allowlists
// against 978abc53 do not describe today's approved native/UI changes.
for (const file of [
  'base44/functions/dispatchExterneAuto/entry.ts',
  'base44/functions/courseEventOrchestrator/entry.ts',
  'base44/shared/dispatchWatchdog.ts',
]) {
  const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      assert.ok(!/lancerDispatchMulti/.test(node.expression.getText(tree)), `v1_runtime_call_found ${file}`);
    }
    if (ts.isImportDeclaration(node)) {
      assert.ok(!node.moduleSpecifier.text.includes('dispatchEngine'), `v1_runtime_import_found ${file}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
const source = readFileSync('base44/functions/dispatchExterneAuto/entry.ts', 'utf8');
const start = source.indexOf('const v2Enabled = await isV2Enabled(base44);');
const end = source.indexOf('// \u2500\u2500\u2500 2.', start);
assert.ok(start > 0 && end > start);
const branch = source.slice(start, end).replace(/\s*}\s*$/, '');
const compiled = ts.transpile(branch, { target: ts.ScriptTarget.ES2022 });
const run = new Function('base44', 'course', 'req', 'isV2Enabled', 'withAuthRetry', 'publierCourseDansFil',
  `return (async () => { ${compiled} })();`);
for (const enabled of [false, true]) {
  for (const enterprise_id of [null, 'enterprise-test']) {
    let published = 0;
    const course = { id: 'isolated-test', enterprise_id };
    const response = await run({}, course, {}, async () => enabled,
      async (_req, _label, fn) => fn({}), async (_sdk, received) => {
        assert.equal(received, course);
        published++;
        return {};
      });
    const body = await response.json();
    assert.equal(published, enabled ? 1 : 0);
    assert.equal(response.status, enabled ? 200 : 503);
    assert.equal(enabled ? body.v2 : body.reason, enabled ? true : 'dispatch_v2_disabled');
  }
}
const v2 = readFileSync('base44/shared/dispatchV2.ts', 'utf8');
for (const guard of ['normalizeEnterpriseId(course.enterprise_id)',
  'normalizeEnterpriseId(livreur.enterprise_id)',
  'if (courseEnterpriseId !== livreurEnterpriseId)',
  "reason: 'enterprise_mismatch'", "ent.actif === false || ent.statut !== 'actif'",
  'enterprise_suspended: true']) assert.ok(v2.includes(guard), guard);
const available = readFileSync('src/hooks/useCoursesDisponibles.js', 'utf8');
assert.ok(available.includes('const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id)'));
assert.ok(available.includes('if (courseEnterpriseId !== livreurEnterpriseId) return false'));
const capacitor = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
assert.ok(!capacitor.server?.url);
console.log('DISPATCH_V2_ENTERPRISE_RECONSTRUCTION=PASS (AST guards and isolated runtime branch, not live dispatch)');
