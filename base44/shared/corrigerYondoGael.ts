import { recalculerSoldeLivreur } from './recalculerSoldeLivreur.ts';
import { normalizeEnterpriseId } from './enterpriseFinance.ts';

// Explicitly authorized six-course repair. No other driver/course can enter this path.
const DRIVER = '6ab53ad96dc8ff74576c56cb';
const PASS = '6ac370b1dba7b5c274650e1e';
const START = '2026-10-05T09:43:18.264Z';
const END = '2026-10-06T09:43:18.264Z';
const KEY = '[YONDO_GAEL_20261005_CORRECTION_2100]';
const EXPECTED = [
  ['6ac385b786a859f278f91b68', 1500, 300, 'pass_zero', 0, '2026-10-05T11:11:56.658Z'],
  ['6ac3ad0ae3ea7456b2eef603', 1500, 300, 'pass_zero', 0, '2026-10-05T14:14:18.900Z'],
  ['6ac3c133d252cc0aae68c30a', 1500, 300, 'pass_zero', 0, '2026-10-05T15:24:53.171Z'],
  ['6ac3d557bfd558a4d9403413', 2000, 400, 'pass_zero', 0, '2026-10-05T17:35:28.512Z'],
  ['6ac3a1010ce0e7a1b8734dfb', 2000, 400, 'normal', 20, '2026-10-05T13:07:55.951Z'],
  ['6ac3cae977324f021f73d05c', 2000, 400, 'normal', 20, '2026-10-05T16:13:58.845Z'],
];
export async function corrigerYondoGael(base44, user, confirmed) {
  if (!confirmed) throw new Error('Confirmation explicite requise');
  const pass = await base44.asServiceRole.entities.PassAchat.get(PASS);
  const before = await base44.asServiceRole.entities.Livreur.get(DRIVER);
  if (pass.livreur_id !== DRIVER || pass.statut !== 'valide' || pass.debut_at !== START || pass.expiration_at !== END || pass.annule_at) {
    throw new Error('PASS_REVALIDATION_FAILED');
  }
  const courses = await Promise.all(EXPECTED.map(([id]) => base44.asServiceRole.entities.CourseExterne.get(id)));
  const repaired = c => c.commission_mode === 'pass_zero' && Number(c.commission_taux_applique) === 0 && c.pass_id === PASS &&
    c.commission_silga === 0 && c.encours_comptabilise_montant === 0 && c.montant_livreur === c.prix_final && (c.notes || '').includes(KEY);
  // Validate EVERY record before the first write, including exact audited acceptance time and price.
  courses.forEach((c, i) => {
    const [id, price, commission, mode, rate, accepted] = EXPECTED[i];
    const unchanged = c.commission_silga === commission && c.commission_mode === mode && c.commission_taux_applique === rate &&
      (mode !== 'pass_zero' || c.pass_id === PASS) && c.encours_comptabilise_montant === (mode === 'pass_zero' ? 0 : commission);
    if (c.id !== id || normalizeEnterpriseId(c.enterprise_id) || c.statut !== 'livree' ||
        c.livreur_id !== DRIVER || (c.livreur_financier_id && c.livreur_financier_id !== DRIVER) ||
        c.prix_final !== price || c.heure_acceptation !== accepted || !c.commission_locked_at || !c.encours_comptabilise_at ||
        !(new Date(accepted) >= new Date(START) && new Date(accepted) < new Date(END)) || (!unchanged && !repaired(c))) {
      throw new Error(`COURSE_REVALIDATION_FAILED:${id}`);
    }
  });
  const changes = [];
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (repaired(c)) { changes.push({ id: c.id, already_corrected: true }); continue; }
    const snapshot = { commission_silga: c.commission_silga, montant_livreur: c.montant_livreur,
      commission_mode: c.commission_mode, commission_taux_applique: c.commission_taux_applique,
      pass_id: c.pass_id, commission_locked_at: c.commission_locked_at,
      encours_comptabilise_at: c.encours_comptabilise_at, encours_comptabilise_montant: c.encours_comptabilise_montant };
    const result = await base44.asServiceRole.entities.CourseExterne.updateMany({
      id: c.id, statut: 'livree', livreur_id: DRIVER, prix_final: c.prix_final,
      heure_acceptation: c.heure_acceptation, commission_silga: c.commission_silga,
      commission_mode: c.commission_mode, commission_taux_applique: c.commission_taux_applique,
      encours_comptabilise_at: c.encours_comptabilise_at,
    }, { $set: {
      commission_mode: 'pass_zero', commission_taux_applique: 0, pass_id: PASS,
      commission_silga: 0, montant_livreur: c.prix_final, encours_comptabilise_montant: 0,
      // Preserve acceptance/delivery, original lock time, CAS marker and immutable financial ID.
      notes: (c.notes || '') + '\n' + KEY + ' before=' + JSON.stringify(snapshot) + ' corrected_by=' + user.email + ' at=' + new Date().toISOString(),
    } });
    if (result?.updated !== 1) throw new Error(`COURSE_CHANGED_CONCURRENTLY:${c.id}`);
    changes.push({ id: c.id, commission_before: c.commission_silga, commission_after: 0, montant_livreur: c.prix_final });
  }
  const balance = await recalculerSoldeLivreur(base44, DRIVER);
  const logs = await base44.asServiceRole.entities.HistoriqueEncours.filter({ livreur_id: DRIVER, commentaire: KEY }, '-created_date', 1);
  if (!logs.length) {
    await base44.asServiceRole.entities.HistoriqueEncours.create({
      type_action: 'reduction_encours', livreur_id: DRIVER, livreur_nom: 'Gael Bayala',
      livreur_telephone: before.telephone, pays_code: before.country_code,
      encours_avant: before.montant_du_silga, encours_apres: balance.solde,
      action_par: user.email, commentaire: KEY, date_action: new Date().toISOString(),
    });
  }
  return { success: true, driver_id: DRIVER, solde_avant: before.montant_du_silga,
    ...balance, changes, artificial_payment: false, artificial_credit: false };
}