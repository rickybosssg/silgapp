import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

let code = readFileSync('base44/functions/envoyerMessage/entry.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default async function', 'async function handler');
code = ts.transpile(code, { target: ts.ScriptTarget.ES2022 });
let messageReads = 0;
const api = { auth: { me: async () => ({ id: 'user-a', email: 'test-a@example.invalid' }) }, asServiceRole: { entities: {
  ClientExterne: { filter: async () => [{ id: 'client-a' }] },
  CourseExterne: { filter: async ({ id }) => [{ id, expediteur_client_id: id === 'course-a' ? 'client-a' : 'client-b' }] },
  Message: { filter: async filter => {
    messageReads++;
    assert.equal(filter.course_id, 'course-a');
    assert.equal(filter.sender_id, 'client-a');
    assert.equal(filter.sender_type, 'client');
    return [{ id: 'message-a', course_id: 'course-a', content: 'test' }];
  } },
} } };
let handler;
new Function('createClientFromRequest', 'Deno', code)(() => api, { serve: fn => { handler = fn; } });
async function send(extra) {
  const result = await handler(new Request('https://isolated.invalid', {
    method: 'POST', body: JSON.stringify({ sender_type: 'client', sender_id: 'client-a', client_message_id: 'same-key', ...extra }),
  }));
  return { status: result.status, body: await result.json() };
}
assert.equal((await send({ course_id: 'course-b' })).status, 403);
assert.equal(messageReads, 0, 'participation checked before an idempotent response can leak messages');
assert.equal((await send({ course_id: 'course-a', conversation_id: 'another' })).status, 400);
assert.equal((await send({})).status, 400);
const own = await send({ course_id: 'course-a' });
assert.equal(own.status, 200);
assert.equal(own.body.message.course_id, 'course-a');
assert.equal(own.body.idempotent, true);
console.log('PASS: real message endpoint under isolated adapters rejects cross-course and ambiguous-scope access, including idempotent retries.');
