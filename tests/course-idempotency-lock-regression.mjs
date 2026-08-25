import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');
const source = read('base44/functions/creerCourseClient/entry.ts');
const schema = JSON.parse(read('base44/entities/AppConfig.jsonc'));

assert.match(source, /const owner = crypto\.randomUUID\(\)/);
assert.match(source, /AppConfig\.updateMany\([\s\S]*lock_owner: owner/);
assert.match(source, /acquireCreationMutex\(base44, normalizedRequestId, user\.email\)/);
assert.match(source, /finally \{[\s\S]*releaseCreationMutex/);
assert.doesNotMatch(source, /Post-creation dedup|Doublon request_id supprimé/);
assert.equal(schema.properties.lock_owner.type, 'string');
assert.equal(schema.properties.lock_expires_at.format, 'date-time');

console.log('COURSE_IDEMPOTENCY_LOCK_REGRESSION=PASS');
