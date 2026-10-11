import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/LivreurExterneApp.jsx', import.meta.url), 'utf8');
const messages = page.slice(page.indexOf('{activeTab === "messages" && ('));
assert.match(messages, /fixed inset-0 z-50 h-\[100dvh\] min-h-0 overflow-hidden/);
assert.match(messages, /<MessagesPage/);
assert.match(messages, /onBack=\{\(\) => \{ setPendingConversationId\(null\); setActiveTab\("courses"\)/);
console.log('PASS driver chat viewport source contract; device rendering not validated');
