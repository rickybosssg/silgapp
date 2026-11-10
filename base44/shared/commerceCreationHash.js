// Server-only canonical hashing for create reservations. Never accept a client hash.
export function canonicalCommercePayload(value) {
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalCommercePayload).join(',')+']';
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalCommercePayload(value[k])).join(',')+'}';
  throw Object.assign(new Error('CANONICAL_PAYLOAD_INVALID'),{code:'CANONICAL_PAYLOAD_INVALID',status:400});
}
export async function hashCommerceCreation(value) {
  const input=new TextEncoder().encode(canonicalCommercePayload(value));
  const digest=await crypto.subtle.digest('SHA-256',input);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
