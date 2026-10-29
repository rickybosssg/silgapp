const invalid = () => ({ success: false, skipped: false, error: 'Réponse du serveur invalide. Actualisez la course avant de réessayer.' });

export function normalizeCourseFunctionResult(response) {
  const wrapped = response && typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'data');
  const body = wrapped ? response.data : response;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid();
  if (wrapped && typeof response.status === 'number' && response.status >= 400) {
    return { success: false, skipped: false, error: typeof body.error === 'string' && body.error ? body.error : `Requête refusée (HTTP ${response.status}).` };
  }
  if ((body.success !== undefined && typeof body.success !== 'boolean') ||
      (body.skipped !== undefined && typeof body.skipped !== 'boolean' && typeof body.skipped !== 'string')) return invalid();
  if (body.error != null && body.error !== '') {
    return { success: false, skipped: false, error: typeof body.error === 'string' ? body.error : 'Opération refusée par le serveur.' };
  }
  return body;
}
