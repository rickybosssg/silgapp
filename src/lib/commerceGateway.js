// INACTIVE MIGRATION ADAPTER: no current screen imports this file.
// Explicit invocation only, never retry automatically after a write.
function responseBody(response) {
  const wrapped = response && typeof response === 'object' && Object.hasOwn(response, 'data');
  const body = wrapped ? response.data : response;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('COMMERCE_RESPONSE_INVALID'), { uncertain: true });
  if ((wrapped && typeof response.status === 'number' && response.status >= 400) || body.success !== true || body.error || body.skipped) {
    throw Object.assign(new Error(typeof body.error === 'string' ? body.error : 'COMMERCE_REQUEST_NOT_CONFIRMED'), { uncertain: body.uncertain !== false, ...(wrapped && Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? { status: response.status } : {}) });
  }
  return body;
}
export async function readCommercePage(invoke, request) {
  const body = responseBody(await invoke('readCommerce', request));
  if (!Array.isArray(body.rows) || typeof body.has_more !== 'boolean') throw new Error('COMMERCE_PAGE_INVALID');
  const offset = request.offset ?? 0;
  if (body.has_more ? (!Number.isSafeInteger(body.next_offset) || body.next_offset <= offset) : body.next_offset !== null) throw new Error('COMMERCE_PAGINATION_INVALID');
  return { rows: body.rows, hasMore: body.has_more, nextOffset: body.next_offset };
}
export async function manageCommerceRecord(invoke, request) {
  const body = responseBody(await invoke('manageCommerce', request));
  if (request.action === 'delete_product') {
    if (body.deleted !== true || body.id !== request.product_id) throw Object.assign(new Error('COMMERCE_DELETE_UNCONFIRMED'), { uncertain: true });
    return { id: body.id, deleted: true };
  }
  const record = body.record;
  const expected = request.action.includes('product') ? request.product_id : request.establishment_id;
  if (!record?.id || (expected && record.id !== expected)) throw Object.assign(new Error('COMMERCE_WRITE_UNCONFIRMED'), { uncertain: true });
  return { record };
}
