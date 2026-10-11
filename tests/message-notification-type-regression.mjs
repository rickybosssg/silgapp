import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('base44/functions/envoiNotificationPush/entry.ts', 'utf8');
const expression = source.match(/const recordType = ([^;]+);/)[1];
const convert = new Function('type', `return ${expression};`);
const schema = JSON.parse(readFileSync('base44/entities/Notification.jsonc', 'utf8'));
assert.ok(schema.properties.type.enum.includes(convert('nouveau_message')));
for (const type of ['nouvelle_course', 'course_annulee', 'colis_recupere', 'on_route_proposal']) assert.equal(convert(type), type);
assert.match(source, /type: recordType/);
// Persisted enum normalization must not change the FCM deep-link payload.
assert.match(source, /type: String\(type \|\| 'generic'\)/);
console.log('PASS message notification persisted enum mapping and unchanged push/source contract; FCM delivery not exercised');
