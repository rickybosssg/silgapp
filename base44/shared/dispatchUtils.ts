// ── Utilitaires partagés du dispatch ────────────────────────────────────────
// Fonctions pures et helpers utilisés par dispatchExterneAuto et dispatchEngine.

const DEBUG = Deno.env.get('DISPATCH_DEBUG') === 'true';

/** Log de débogage — supprimé en production (sauf DISPATCH_DEBUG=true) */
export function dispatchLog(...args: any[]) {
  if (DEBUG) console.log(...args);
}

export function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

export function generatePIN() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function normalizeNom(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function verifierPaysCourseLivreur(base44, course, livreurId, contexte) {
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
  if (!livreur) {
    return { ok: false, status: 404, response: { success: false, found: false, error: 'Livreur introuvable' } };
  }
  const courseCountry = normalizeCountryCode(course?.country_code);
  const livreurCountry = normalizeCountryCode(livreur.country_code);
  if (!courseCountry || !livreurCountry || courseCountry !== livreurCountry) {
    console.error('[DISPATCH][COUNTRY_MISMATCH_BLOCKED]', { contexte, course_id: course?.id, livreur_id: livreurId, course_country_code: courseCountry || 'ABSENT', livreur_country_code: livreurCountry || 'ABSENT' });
    return { ok: false, status: 403, response: { success: false, found: false, error: 'country_mismatch', blocked_reason: 'country_mismatch' } };
  }
  return { ok: true, livreur, courseCountry, livreurCountry };
}

export function reponseDejaPrise(reason, course, details = {}) {
  return {
    success: false, accepted: false, reason: 'already_taken', already_taken: true,
    error: 'Cette course a deja ete prise par un autre livreur',
    dispatch_status: course?.dispatch_status || '',
    existing_livreur_id: course?.livreur_id || '',
    accepted_by_livreur_id: course?.accepted_by_livreur_id || course?.livreur_id || '',
    details: reason, ...details,
  };
}

export async function supprimerNotificationsCourse(base44, courseId) {
  try {
    await base44.asServiceRole.entities.Notification.updateMany(
      { course_id: courseId, type: 'nouvelle_course', lue: false },
      { $set: { lue: true } }
    );
  } catch (err) { console.warn('[DISPATCH] ⚠️ Erreur archivage:', err.message); }
}

export function journaliserDispatch(base44, data) {
  try {
    base44.asServiceRole.entities.DispatchLog.create({
      course_id: data.course_id || '',
      heure: new Date().toISOString(),
      vague: data.vague || 0,
      vague_avant: data.vague_avant ?? null,
      vague_apres: data.vague_apres ?? null,
      wave_started_at: data.wave_started_at || null,
      wave_expired_at: data.wave_expired_at || null,
      nombre_deja_consultes: data.nombre_deja_consultes ?? null,
      nombre_nouveaux_notifies: data.nombre_nouveaux_notifies ?? null,
      raison_passage: data.raison_passage || '',
      raison_blocage: data.raison_blocage || '',
      pickup_source: data.pickup_source || '',
      evenement: data.evenement || 'vague',
      country_code: data.country_code || '',
      total_candidats: data.total_candidats || 0,
      total_exclus: data.total_exclus || 0,
      timeout_sec: data.timeout_sec || 0,
      livreurs_selectionnes: data.livreurs_selectionnes ? JSON.stringify(data.livreurs_selectionnes) : '',
      ordre_tri: data.ordre_tri_complet ? JSON.stringify(data.ordre_tri_complet) : '',
      raisons_exclusion: data.raisons_exclusion ? JSON.stringify(data.raisons_exclusion) : '',
      livreur_acceptant_id: data.livreur_acceptant_id || '',
      livreur_acceptant_nom: data.livreur_acceptant_nom || '',
      temps_avant_acceptation_sec: data.temps_avant_acceptation_sec ?? null,
    }).catch(err => console.error('[DISPATCH] ❌ Erreur journalisation:', err.message));
  } catch (err) {
    console.error('[DISPATCH] ❌ Erreur journalisation (init):', err.message);
  }
}