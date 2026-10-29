import {
  GUEST_PREFIX, GUEST_CAPACITY, GUEST_ACCESS_MS, validSecret, validRequest, sha256,
  failGuest, guestCreationEnabled, parseGuestLedger, guestAdminScope, guestSuperAdmin,
  validateGuestDraft, guestCourseData, guestCourseView, invitationEligibility, guestDriverPosition,
} from './guestOrderPolicy.js';

/** All external effects are injected; the exact same service runs in isolated tests and the endpoint. */
export function createGuestOrdersService(deps) {
  const { store, entities, publish, cancel, decide } = deps;
  const now = deps.now || (() => Date.now());
  async function countries(control) {
    let codes;
    try { codes = JSON.parse(control.countries); } catch { codes = null; }
    if (!Array.isArray(codes) || codes.some(c => !/^[A-Z]{2}$/.test(c))) failGuest('CONFIG_INVALID', 'Configuration des pays indisponible.', 503);
    return codes;
  }
  async function config() {
    try {
      const control = await store.policy();
      const allowed = guestCreationEnabled(control) ? await countries(control) : [];
      return { enabled: guestCreationEnabled(control) && allowed.length > 0, countries: allowed };
    } catch { return { enabled: false, countries: [], unavailable: true }; }
  }
  async function country(code) {
    const matches = await entities.Country.filter({ code, actif: true }, 'created_date', 2);
    if (matches.length !== 1) failGuest('COUNTRY_INVALID', 'Pays indisponible.', 503);
    return matches[0];
  }
  async function catalog(body) {
    const control = await store.policy();
    if (!guestCreationEnabled(control) || !(await countries(control)).includes(body.country_code)) failGuest('DISABLED', 'Les nouvelles commandes sans compte ne sont pas disponibles.', 403);
    const c = await country(body.country_code);
    const rows = await entities.Quartier.filter({ country_code: c.code, actif: true }, 'nom', 501);
    if (rows.length > 500) failGuest('CATALOG_LIMIT', 'Catalogue trop important. Contactez le support.', 503);
    const phoneCountries = await entities.Country.filter({ actif: true }, 'nom', 101);
    if (phoneCountries.length > 100) failGuest('CATALOG_LIMIT', 'Catalogue de pays indisponible.', 503);
    return { country: { code: c.code, nom: c.nom, devise: c.devise, devise_symbole: c.devise_symbole, indicatif: c.indicatif, prix_minimum: c.prix_minimum },
      phone_countries: phoneCountries.map(p => ({ code: p.code, nom: p.nom, indicatif: p.indicatif, actif: p.actif, phone_min_length: p.phone_min_length, phone_max_length: p.phone_max_length, phone_pattern: p.phone_pattern })),
      quartiers: rows.map(q => ({ id: q.id, nom: q.nom, ville: q.ville, ville_operationnelle: q.ville_operationnelle })) };
  }
  async function credentials(body, action = false) {
    if (!validRequest(body.request_id) || !validSecret(body[action ? 'action_token' : 'read_token'])) failGuest('ACCESS_DENIED', 'Accès privé invalide.', 403);
    const hash = await sha256(body[action ? 'action_token' : 'read_token']);
    const control = await store.read();
    const entry = parseGuestLedger(control).find(e => e.request_id === body.request_id);
    if (!entry || entry[action ? 'action_hash' : 'read_hash'] !== hash || entry.revoked_at || now() >= Date.parse(entry.expires_at)) failGuest('ACCESS_DENIED', 'Accès privé expiré ou indisponible.', 403);
    return entry;
  }
  function assertCourse(entry, course) {
    if (!course || course.request_id !== GUEST_PREFIX + entry.request_id || course.country_code !== entry.country_code || course.enterprise_id || course.client_user_email || course.expediteur_client_id || course.destinataire_client_id) failGuest('COURSE_SCOPE', 'Suivi indisponible. Contactez le support.', 403);
    return course;
  }
  async function findCourse(entry) {
    if (entry.course_id) return assertCourse(entry, await entities.CourseExterne.get(entry.course_id));
    const matches = await entities.CourseExterne.filter({ request_id: GUEST_PREFIX + entry.request_id, country_code: entry.country_code, enterprise_id: null }, 'created_date', 2);
    if (matches.length > 1) failGuest('DUPLICATE_DETECTED', 'Vérification administrative nécessaire.', 409);
    return matches[0] ? assertCourse(entry, matches[0]) : null;
  }
  async function receipt(entry, course) {
    await store.mutate((_control, ledger) => {
      const current = ledger.find(e => e.request_id === entry.request_id);
      if (!current || current.revoked_at || current.read_hash !== entry.read_hash) failGuest('ACCESS_DENIED', 'Accès indisponible.', 403);
      current.course_id = course.id; current.state = 'created';
      return { patch: { ledger: JSON.stringify(ledger) }, value: null };
    });
  }
  async function view(entry, course) {
    const dto = guestCourseView(course, entry.currency);
    let driverPosition = null;
    if (course.livreur_id && !['livree', 'annulee', 'terminee'].includes(course.statut) && entities.Livreur?.get) {
      try { driverPosition = guestDriverPosition(await entities.Livreur.get(course.livreur_id), course, now()); }
      catch { /* Position optional: preserve confirmed course status, never invent a point. */ }
    }
    if (!dto.reference && deps.reference && course.id && course.created_date) dto.reference = deps.reference(course);
    return { success: true, course: { ...dto, driver_position: driverPosition, invitation_consent: entry.invitation_consent === true, invitation_opposed: entry.opposed === true }, expires_at: entry.expires_at };
  }
  async function track(body) {
    const entry = await credentials(body);
    const course = await findCourse(entry);
    if (!course) return { success: false, pending: true, code: 'CREATION_UNCERTAIN', message: 'Vérification en cours. Ne recommencez pas la commande.' };
    if (!entry.course_id) await receipt(entry, course);
    if (['livree', 'annulee', 'terminee'].includes(course.statut) && !entry.closed_at) {
      await store.mutate((_control, ledger) => {
        const current = ledger.find(e => e.request_id === entry.request_id);
        if (current && !current.closed_at) current.closed_at = new Date(now()).toISOString();
        return { patch: { ledger: JSON.stringify(ledger) }, value: null };
      });
    }
    return view(entry, course);
  }
  async function create(body) {
    const allowed = ['action', 'request_id', 'read_token', 'action_token', 'device_token', 'draft'];
    if (Object.keys(body).some(k => !allowed.includes(k)) || !validRequest(body.request_id) || !validSecret(body.read_token) || !validSecret(body.action_token) || !validSecret(body.device_token) || body.read_token === body.action_token || body.device_token === body.read_token || body.device_token === body.action_token) failGuest('INVALID_REQUEST', 'Commande invalide.');
    const [readHash, actionHash, deviceHash] = await Promise.all([sha256(body.read_token), sha256(body.action_token), sha256(body.device_token)]);
    const registry = await store.read();
    const previous = parseGuestLedger(registry).find(e => e.request_id === body.request_id);
    if (previous) {
      if (previous.read_hash !== readHash || previous.action_hash !== actionHash || previous.device_hash !== deviceHash) failGuest('ACCESS_DENIED', 'Accès privé invalide.', 403);
      // Recovery never writes another course or repeats publication, even with creation disabled.
      return track(body);
    }
    // Resolve only this device capability's earlier pending attempts. A terminal
    // receipt frees the active slot, never reopens or deletes the previous course.
    for (const older of parseGuestLedger(registry).filter(e => e.device_hash === deviceHash && !e.closed_at)) {
      const course = await findCourse(older);
      if (course && ['livree', 'annulee', 'terminee'].includes(course.statut)) {
        await store.mutate((_control, ledger) => {
          const current = ledger.find(e => e.request_id === older.request_id);
          if (current && !current.closed_at) current.closed_at = new Date(now()).toISOString();
          return { patch: { ledger: JSON.stringify(ledger) }, value: null };
        });
      }
    }
    const priorControl = await store.policy();
    if (!guestCreationEnabled(priorControl) || !(await countries(priorControl)).includes(body.draft?.country_code)) failGuest('DISABLED', 'Les nouvelles commandes sans compte ne sont pas disponibles.', 403);
    const c = await country(body.draft.country_code);
    const depart = await entities.Quartier.get(body.draft.depart_id);
    const arrivee = await entities.Quartier.get(body.draft.arrivee_id);
    const phoneCountry = body.draft.phone_country_code && body.draft.phone_country_code !== c.code ? await country(body.draft.phone_country_code) : c;
    const checked = validateGuestDraft(body.draft, c, depart, arrivee, phoneCountry);
    const fingerprint = await sha256(JSON.stringify({ country: c.code, depart: depart.id, arrivee: arrivee.id, prix: checked.prix, phone: checked.telephone, consent: body.draft.invitation_consent }));
    const entry = { request_id: body.request_id, read_hash: readHash, action_hash: actionHash, device_hash: deviceHash,
      fingerprint, country_code: c.code, phone_country_code: phoneCountry.code, phone: checked.telephone, invitation_consent: false,
      consent_at: null, consent_version: null, opposed: false,
      currency: c.devise_symbole || c.devise, invitation_channel: null, last_invitation_at: null, invitation_result: 'not_sent',
      created_at: new Date(now()).toISOString(), expires_at: new Date(now() + GUEST_ACCESS_MS).toISOString(), state: 'creating', course_id: null };
    // This CAS orders authorization against OFF. Already authorized requests may finish.
    await store.mutatePolicy(control => {
      if (!guestCreationEnabled(control) || control.countries !== priorControl.countries) failGuest('DISABLED', 'Les nouvelles commandes sans compte ne sont plus disponibles.', 403);
      let grants; try { grants = JSON.parse(control.grants || '[]'); } catch { failGuest('CONFIG_INVALID', 'Registre des autorisations indisponible.', 503); }
      if (!Array.isArray(grants) || grants.length >= GUEST_CAPACITY) failGuest('CAPACITY', 'Commandes sans compte temporairement indisponibles.', 503);
      const grant = grants.find(g => g.request_id === entry.request_id);
      if (grant) {
        if (grant.fingerprint !== fingerprint || grant.read_hash !== readHash || grant.action_hash !== actionHash || grant.device_hash !== deviceHash) failGuest('REQUEST_CONFLICT', 'Tentative incompatible.', 409);
        return { value: null };
      }
      if (grants.filter(g => g.country_code === c.code && now() - Date.parse(g.at) < 3600000).length >= 30) failGuest('RATE_LIMIT', 'Trop de demandes. Réessayez plus tard ou contactez le support.', 429);
      grants.push({ request_id: entry.request_id, fingerprint, read_hash: readHash, action_hash: actionHash, device_hash: deviceHash, country_code: c.code, at: new Date(now()).toISOString() });
      return { patch: { grants: JSON.stringify(grants) }, value: null };
    });
    const won = await store.mutate((_control, ledger) => {
      const existing = ledger.find(e => e.request_id === entry.request_id);
      if (existing) {
        if (existing.read_hash !== readHash || existing.action_hash !== actionHash || existing.device_hash !== deviceHash || existing.fingerprint !== fingerprint) failGuest('REQUEST_CONFLICT', 'Cette tentative correspond à une autre commande.', 409);
        return { value: false };
      }
      if (ledger.some(e => e.device_hash === deviceHash && !e.closed_at)) failGuest('DEVICE_LIMIT', 'Une commande est déjà en cours sur cet appareil. Retrouvez son suivi.', 409);
      if (ledger.length >= GUEST_CAPACITY) failGuest('CAPACITY', 'Commandes sans compte temporairement indisponibles.', 503);
      if (ledger.filter(e => e.phone === checked.telephone && e.country_code === c.code && now() - Date.parse(e.created_at) < 3600000).length >= 10) failGuest('RATE_LIMIT', 'Trop de demandes rapprochées. Réessayez plus tard ou contactez le support.', 429);
      ledger.push(entry);
      return { patch: { ledger: JSON.stringify(ledger) }, value: true };
    });
    if (!won) return track(body);
    // Persisted claim has no expiry/reclaim: after an uncertain create, recovery is read-only.
    let course;
    try { course = await entities.CourseExterne.create(guestCourseData(body.draft, c, depart, arrivee, checked.telephone, body.request_id)); }
    catch { return { success: false, pending: true, code: 'CREATION_UNCERTAIN', message: 'Résultat non confirmé. Conservez votre accès privé et vérifiez le suivi.' }; }
    assertCourse(entry, course);
    await receipt(entry, course);
    let dispatch = 'pending';
    try { const result = await publish(course); dispatch = result?.success === true ? 'confirmed' : 'pending'; } catch { /* Keep one course and an honest pending state. */ }
    return { ...await view(entry, assertCourse(entry, await entities.CourseExterne.get(course.id))), dispatch };
  }
  async function act(body) {
    const entry = await credentials(body, true);
    const course = await findCourse(entry);
    if (!course) failGuest('PENDING', 'Création encore en vérification.', 409);
    const dto = guestCourseView(course, '');
    if (body.action === 'cancel') {
      if (course.statut !== 'annulee' && !dto.can_cancel) failGuest('INCIDENT_ADMIN', 'Contactez le support pour cette course déjà prise en charge.', 409);
      await cancel(course, GUEST_PREFIX + entry.request_id);
    } else if (body.action === 'retry_dispatch') {
      if (!course.client_decision_attendue || course.livreur_id || course.heure_recuperation || course.pickup_confirmed_at || course.annulation_user_id || ['livree', 'annulee', 'terminee'].includes(course.statut)) failGuest('DECISION_REFUSED', 'Cette course ne peut pas être relancée.', 409);
      await decide(course);
    } else if (body.action === 'consent') {
      if (body.consent !== false) failGuest('CONSENT_INVALID', 'Les invitations promotionnelles ne sont pas proposées.');
      await store.mutate((_control, ledger) => {
        const current = ledger.find(e => e.request_id === entry.request_id);
        if (!current || current.revoked_at) failGuest('ACCESS_DENIED', 'Accès indisponible.', 403);
        current.invitation_consent = body.consent; current.opposed = !body.consent;
        current.consent_at = new Date(now()).toISOString();
        return { patch: { ledger: JSON.stringify(ledger) }, value: null };
      });
    } else failGuest('ACTION_INVALID', 'Action non autorisée.');
    const currentEntry = await credentials(body, true);
    return view(currentEntry, assertCourse(currentEntry, await entities.CourseExterne.get(course.id)));
  }
  async function admin(body, user) {
    const scope = guestAdminScope(user, body.country_code || '');
    if (body.action === 'set_enabled') {
      guestSuperAdmin(user);
      if (typeof body.enabled !== 'boolean') failGuest('INVALID_FLAG', 'Valeur invalide.');
      await store.mutatePolicy((control) => {
        if (body.enabled && control.safety_reviewed !== true) failGuest('SAFETY_REVIEW_REQUIRED', 'Contrôles de confidentialité et déploiement requis avant activation.', 409);
        if (body.enabled) {
          let allowed; try { allowed = JSON.parse(control.countries); } catch { allowed = null; }
          if (!Array.isArray(allowed) || !allowed.length || allowed.some(c => !/^[A-Z]{2}$/.test(c))) failGuest('COUNTRIES_REQUIRED', 'Configurez les pays autorisés avant activation.', 409);
        }
        if (control.enabled === body.enabled) return { value: null };
        let audit; try { audit = JSON.parse(control.audit || '[]'); } catch { failGuest('AUDIT_INVALID', 'Journal indisponible.', 503); }
        if (!Array.isArray(audit) || (body.enabled && audit.length >= 500)) failGuest('AUDIT_CAPACITY', 'Archivage du journal requis.', 503);
        audit.push({ at: new Date(now()).toISOString(), actor_id: user.id, old: control.enabled === true, enabled: body.enabled });
        return { patch: { enabled: body.enabled, audit: JSON.stringify(audit) }, value: null };
      });
    }
    if (body.action === 'revoke') {
      await store.mutate((_control, ledger) => {
        const e = ledger.find(v => v.request_id === body.request_id && (!scope || v.country_code === scope));
        if (!e) failGuest('NOT_FOUND', 'Commande introuvable.', 404);
        e.revoked_at = new Date(now()).toISOString(); e.revoked_by = user.id;
        return { patch: { ledger: JSON.stringify(ledger) }, value: null };
      });
    } else if (!['admin_list', 'set_enabled'].includes(body.action)) failGuest('ACTION_INVALID', 'Action non autorisée.');
    const registry = await store.read();
    const control = await store.policy().catch(() => null);
    const scopedLedger = parseGuestLedger(registry).filter(e => !scope || e.country_code === scope);
    const selected = scopedLedger.filter(e =>
      (!body.from || e.created_at >= body.from) && (!body.to || e.created_at <= body.to));
    const courses = selected.length ? await entities.CourseExterne.filter({ request_id: { $in: selected.map(e => GUEST_PREFIX + e.request_id) }, enterprise_id: null, ...(scope ? { country_code: scope } : {}) }, '-created_date', GUEST_CAPACITY + 1) : [];
    const rows = selected.map(e => {
      const course = courses.find(c => c.request_id === GUEST_PREFIX + e.request_id && c.country_code === e.country_code && !c.enterprise_id);
      return { request_id: e.request_id, course_id: course?.id || null, reference: course?.reference || course?.reference_course || (course?.id && course?.created_date && deps.reference ? deps.reference(course) : null),
        date: e.created_at, country_code: e.country_code, phone: e.phone, statut: course?.statut || null,
        montant: course?.prix_final ?? course?.prix_propose_client ?? null, devise: e.currency,
        invitation: invitationEligibility(scopedLedger.filter(v => v.phone === e.phone && v.country_code === e.country_code), now()),
        revoked: !!e.revoked_at, incomplete: !course };
    });
    const filtered = rows.filter(r => !body.statut || r.statut === body.statut);
    const complete = rows.every(r => !r.incomplete);
    const contacts = [...new Map(filtered.map(r => [r.country_code + ':' + r.phone, { country_code: r.country_code, phone: r.phone, verified_person: false, invitation: r.invitation,
      courses: filtered.filter(v => v.country_code === r.country_code && v.phone === r.phone).map(v => v.request_id) }])).values()];
    return { success: true, enabled: control?.enabled === true, safety_reviewed: control?.safety_reviewed === true, configuration_unavailable: !control,
      rows: filtered, contacts, partial: !complete, as_of: new Date(now()).toISOString(),
      counts: { created: complete ? rows.length : null, pending_attempts: rows.filter(r => r.incomplete).length, in_progress: complete ? rows.filter(r => !['livree', 'annulee', 'terminee'].includes(r.statut)).length : null,
        delivered: complete ? rows.filter(r => r.statut === 'livree').length : null, cancelled: complete ? rows.filter(r => r.statut === 'annulee').length : null,
        distinct_declared_numbers: new Set(rows.map(r => r.country_code + ':' + r.phone)).size, registrations: null },
      invitation_preview: 'Découvrez SILGAPP et créez votre compte pour vos prochaines commandes : https://silga-dispatch-go.base44.app/',
      invitation_sending: 'Non disponible' };
  }
  return { config, catalog, create, track, act, admin };
}
