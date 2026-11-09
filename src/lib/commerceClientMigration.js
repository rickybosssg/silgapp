import { createCommerceQueries } from './commerceQueries.js';

// Source-controlled client rollout, enabled locally with explicit user approval.
// Visit-counter migration is still separate; secure detail screens do not write counters.
// Never enable from localStorage, a URL, or a failed legacy read.
export const COMMERCE_CLIENT_MIGRATION_ENABLED = true;
const kinds = { boutique: ['Boutique', 'ProduitBoutique', 'boutique_id'], restaurant: ['Restaurant', 'PlatRestaurant', 'restaurant_id'] };
function fail(code) { throw new Error(code); }
function hasCountry(profile) { return typeof profile?.country_code === 'string' && /^[A-Z]{2}$/.test(profile.country_code); }
function requireContext(context) {
  const { profile, userId, userEmail } = context || {};
  if (!userId || !userEmail || !profile?.id || profile.user_email !== userEmail || !hasCountry(profile) || profile.enterprise_id || profile.actif === false) fail('CLIENT_PROFILE_REQUIRED');
}
export async function loadCommerceClientContext(sdk, secure = COMMERCE_CLIENT_MIGRATION_ENABLED, requireCountry = true) {
  const user = await sdk.auth.me();
  if (!user?.email) fail('CLIENT_AUTH_REQUIRED');
  const profiles = await sdk.entities.ClientExterne.filter({ user_email: user.email });
  if (!Array.isArray(profiles)) fail('CLIENT_PROFILE_RESPONSE_INVALID');
  if (secure && (profiles.length !== 1 || user.enterprise_id)) fail('CLIENT_PROFILE_REQUIRED');
  const context = { profile: profiles[0], userId: user.id, userEmail: user.email };
  if (!context.profile?.id || ((secure || requireCountry) && !hasCountry(context.profile))) fail('CLIENT_PROFILE_REQUIRED');
  if (secure) requireContext(context);
  return context;
}
export function clientCommerceQueryKey(context, { type, action, parentId = undefined, secure = COMMERCE_CLIENT_MIGRATION_ENABLED }) {
  return ['client-commerce', secure ? 'server' : 'legacy', context?.userId, context?.profile?.id, context?.profile?.country_code, type, action, parentId || ''];
}
export async function readClientCommercePage(sdk, context, { type, action, parentId = undefined, offset = 0, secure = COMMERCE_CLIENT_MIGRATION_ENABLED }) {
  if (!Object.hasOwn(kinds, type) || !['catalogue', 'products', 'orders'].includes(action) || (action === 'products' && !parentId)) fail('CLIENT_CATALOGUE_SCOPE_INVALID');
  const [parentEntity, productEntity, parentKey] = kinds[type];
  if (secure) {
    requireContext(context);
    // Fresh authentication prevents an old page request from silently switching accounts.
    const user = await sdk.auth.me();
    if (user?.id !== context.userId || user?.email !== context.userEmail || user.enterprise_id) fail('CLIENT_SESSION_CHANGED');
    const queries = createCommerceQueries((name, body) => sdk.functions.invoke(name, body));
    const request = { type, profileId: context.profile.id, parentId, offset, limit: 50 };
    const page = await (action === 'orders' ? queries.orders({ ...request, audience: 'client', countryCode: undefined }) : action === 'products' ? queries.clientProducts(request) : queries.clientCatalogue(request));
    const seen = new Set();
    if (page.rows.some(row => {
      if (!row?.id || seen.has(row.id)) return true;
      seen.add(row.id);
      return action === 'orders'
        ? row.pays_code !== context.profile.country_code || !row[parentKey] || (parentId && row[parentKey] !== parentId)
        : action === 'products'
        ? row[parentKey] !== parentId || row.actif !== true || row.disponible !== true
        : row.pays_code !== context.profile.country_code || row.actif !== true || (parentId && row.id !== parentId);
    })) fail('CLIENT_CATALOGUE_RESPONSE_INVALID');
    return page;
  }
  // Explicit legacy mode only. No fallback from a rejected server read.
  let rows;
  if (action === 'orders') rows = await sdk.entities[type === 'restaurant' ? 'CommandeRestaurant' : 'CommandeBoutique'].filter({ client_id: context.profile.id }, '-created_date', 50);
  else if (action === 'products') rows = await sdk.entities[productEntity].filter({ [parentKey]: parentId, disponible: true, actif: true }, '-created_date', 200);
  else if (parentId) { const record = await sdk.entities[parentEntity].get(parentId); rows = record ? [record] : []; }
  else rows = await sdk.entities[parentEntity].filter({ pays_code: context.profile.country_code, actif: true }, '-created_date', 100);
  if (!Array.isArray(rows)) fail('CLIENT_CATALOGUE_RESPONSE_INVALID');
  return { rows, hasMore: false, nextOffset: null };
}
export function flattenClientCommercePages(data) {
  const rows = new Map();
  for (const page of data?.pages || []) for (const row of page.rows) rows.set(row.id, row);
  return [...rows.values()];
}

function checkReadSignal(signal) {
  if (signal?.aborted) throw Object.assign(new Error('CLIENT_READ_CANCELLED'), { name: 'AbortError' });
}
// Only a complete collection may drive a map or an active-order count.
export async function readAllClientCommerceRows(sdk, context, request, { signal = undefined, maxPages = 20 } = {}) {
  const rows = [], seen = new Set();
  let offset = 0;
  for (let index = 0; index < maxPages; index++) {
    checkReadSignal(signal);
    const page = await readClientCommercePage(sdk, context, { ...request, offset });
    checkReadSignal(signal);
    for (const row of page.rows) {
      if (seen.has(row.id)) fail('CLIENT_PAGINATION_CHANGED');
      seen.add(row.id); rows.push(row);
    }
    if (!page.hasMore) return rows;
    offset = page.nextOffset;
  }
  fail('CLIENT_PAGINATION_INCOMPLETE');
}
// The current server has no order_id parameter. Scan only the caller's projected
// orders; never pass an order ID as parent_id or fall back to an entity read.
export async function readClientRestaurantOrder(sdk, context, { orderId, courseId, signal, maxPages = 20 }) {
  if (!orderId || !courseId) fail('CLIENT_ORDER_SCOPE_REQUIRED');
  let offset = 0;
  const seen = new Set();
  for (let index = 0; index < maxPages; index++) {
    checkReadSignal(signal);
    const page = await readClientCommercePage(sdk, context, { type: 'restaurant', action: 'orders', offset, secure: true });
    checkReadSignal(signal);
    for (const row of page.rows) {
      if (seen.has(row.id)) fail('CLIENT_PAGINATION_CHANGED');
      seen.add(row.id);
    }
    const order = page.rows.find(row => row.id === orderId);
    if (order) {
      if (order.course_id !== courseId) fail('CLIENT_ORDER_COURSE_MISMATCH');
      return order;
    }
    if (!page.hasMore) return null;
    offset = page.nextOffset;
  }
  fail('CLIENT_PAGINATION_INCOMPLETE');
}
export function clientCommercePollingInterval(query, interval = 60000) {
  // A failure requires a voluntary retry. No background polling or denied-read loop.
  if (query?.state?.error || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return false;
  return interval;
}
