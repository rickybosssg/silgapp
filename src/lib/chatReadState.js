const prefix = 'silgapp:chat-read:v1:';
export const chatReadKey = (type, id, scope) => `${prefix}${type}:${id}:${scope}`;
export function lastChatRead(type, id, scope) {
  try { return Number(localStorage.getItem(chatReadKey(type, id, scope))) || 0; } catch { return 0; }
}
export function markChatRead(type, id, scope, date) {
  const timestamp = Date.parse(date);
  if (!type || !id || !scope || !Number.isFinite(timestamp)) return;
  try { localStorage.setItem(chatReadKey(type, id, scope), String(Math.max(timestamp, lastChatRead(type, id, scope)))); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new Event('silgapp:chat-read'));
}
export function isChatUnread(message, type, id, scope) {
  return !!message && !(message.sender_type === type && String(message.sender_id) === String(id)) &&
    Date.parse(message.created_date) > lastChatRead(type, id, scope);
}
