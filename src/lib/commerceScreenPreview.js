// Qualification seam only. Caller identity partitions cache; server remains authority.
export async function readPartnerProductPreview(session, { type, parentId, offset = 0 }) {
  if (!session || typeof session.userId !== 'string' || !session.userId.trim() || typeof session.queries?.partnerProducts !== 'function') throw new Error('COMMERCE_PREVIEW_SESSION_REQUIRED');
  if (!['boutique','restaurant'].includes(type) || typeof parentId !== 'string' || !parentId.trim() || !Number.isSafeInteger(offset) || offset < 0) throw new Error('COMMERCE_PREVIEW_SCOPE_INVALID');
  const page = await session.queries.partnerProducts({type, parentId, offset, limit:50});
  const key = type === 'boutique' ? 'boutique_id' : 'restaurant_id';
  if (!page || !Array.isArray(page.rows) || page.rows.length > 50 || typeof page.hasMore !== 'boolean' || page.rows.some(row => !row?.id || row[key] !== parentId)) throw new Error('COMMERCE_PREVIEW_PAGE_INVALID');
  if (page.hasMore ? page.nextOffset !== offset + 50 : page.nextOffset !== null) throw new Error('COMMERCE_PREVIEW_CURSOR_INVALID');
  return page;
}
