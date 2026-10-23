import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const file = 'base44/functions/annulerCourseExterne/entry.ts';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const call = source.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(source) === 'Deno.serve').expression;
const code = ts.transpileModule('const handler = ' + call.arguments[0].getText(source) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

for (const authorized of [false, true]) {
 test(`actual cancellation validation exposes version without reading a course (authenticated=${authorized})`, async () => {
  let entityReads = 0;
  const api = { auth: { me: async () => authorized ? { id: 'isolated-user' } : null }, asServiceRole: { entities: { CourseExterne: { get: async () => { entityReads++;throw Error('Course access forbidden in this probe'); } } } } };
  const handler = new Function('createClientFromRequest', code + ';return handler;')(() => api);
  const response = await handler(new Request('http://localhost/isolated', { method: 'POST', body: '{}' }));
  assert.equal(response.status, authorized ? 400 : 401);
  assert.equal(response.headers.get('X-Silgapp-Cancellation-Guard'), 'terminal-v1');
  assert.equal((await response.json()).guard_version, 'terminal-v1');
  assert.equal(entityReads, 0);
 });
}
