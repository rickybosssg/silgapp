import { readFileSync } from 'node:fs';

const fail = (msg) => {
  console.error(`FINAL_ENTERPRISE_RELEASE_GUARDS=FAIL ${msg}`);
  process.exit(1);
};

const text = (path) => readFileSync(path, 'utf8');

const envoyerMessage = text('base44/functions/envoyerMessage/entry.ts');
const adminBranch = envoyerMessage.match(/else if \(sender_type === 'admin'\) \{[\s\S]*?realName = user\.full_name/);
if (!adminBranch) fail('envoyerMessage_admin_branch_missing');
if (!adminBranch[0].includes("user.role !== 'admin'")) fail('sender_type_admin_role_guard_missing');
if (!adminBranch[0].includes('status: 403')) fail('sender_type_admin_403_missing');
if (adminBranch[0].indexOf("user.role !== 'admin'") > adminBranch[0].indexOf('final_sender_id = user.email')) {
  fail('sender_type_admin_guard_after_privilege_assignment');
}

const clientApp = text('src/pages/ClientExterneApp.jsx');
for (const needle of [
  'const STATUTS_SUIVABLES_CLIENT',
  'COURSE_STATUSES.NOUVELLE',
  'COURSE_STATUSES.RECHERCHE_LIVREUR',
  '...STATUTS_ACTIFS_COURSE',
  'bg-amber-400',
  'border-amber-300',
  'text-gray-900',
  'Suivre ma course',
  'Suivre mes courses',
  'setShowMultiCourseSelector(true)',
  'navigate("/client/suivi", { state: { course_id: coursesActives[0].id } })',
  '<MultiCourseSelector',
  '<SuiviCourseFullscreen',
  '<SuiviBarreFlottante',
]) {
  if (!clientApp.includes(needle)) fail(`client_follow_button_missing needle=${needle}`);
}

const statusBlock = clientApp.slice(
  clientApp.indexOf('const STATUTS_SUIVABLES_CLIENT'),
  clientApp.indexOf('export default function ClientExterneApp')
);
for (const forbidden of ['"livree"', '"annulee"', '"en_attente"', '"programmee"']) {
  if (statusBlock.includes(forbidden)) fail(`client_follow_status_forbidden status=${forbidden}`);
}

const app = text('src/App.jsx');
for (const needle of [
  "const ClientExterneApp = lazy(() => import('./pages/ClientExterneApp.jsx'))",
  '<Route path="/" element={<ClientExterneApp />} />',
  '<Route path="/client/suivi" element={<ClientSuiviCourse />} />',
  '<Route path="/admin/suivi-enterprise" element={<AnimatedRoutes><SuiviEnterprise /></AnimatedRoutes>} />',
]) {
  if (!app.includes(needle)) fail(`route_missing needle=${needle}`);
}

const dispatchV2 = text('base44/shared/dispatchV2.ts');
for (const needle of [
  'updateData.enterprise_commission_rate_locked',
  'updateData.enterprise_commission_locked_at',
  '!courseEnterpriseId && courseVerifie.heure_acceptation',
  'normalizeEnterpriseId(course.enterprise_id)',
  'normalizeEnterpriseId(livreur.enterprise_id)',
]) {
  if (!dispatchV2.includes(needle)) fail(`dispatch_enterprise_guard_missing needle=${needle}`);
}

const enterpriseFinance = text('base44/shared/enterpriseFinance.ts');
for (const needle of [
  'enterprise_commission_rate_locked',
  'EnterpriseLedger.create',
  'requestId = `ENT_COMMISSION_${course.id}`',
  'montant_du_silgapp',
]) {
  if (!enterpriseFinance.includes(needle)) fail(`enterprise_finance_missing needle=${needle}`);
}

const verifierEncours = text('base44/functions/verifierEncoursLivreur/entry.ts');
if (!verifierEncours.includes('course.enterprise_id')) fail('public_finance_enterprise_skip_missing');
if (!verifierEncours.includes('encours_comptabilise_montant: 0')) fail('enterprise_public_encours_zero_missing');

const annulerCourse = text('base44/functions/annulerCourseExterne/entry.ts');
for (const needle of [
  "import { normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts'",
  'const userEnterpriseId = normalizeEnterpriseId(user?.enterprise_id ?? user?.data?.enterprise_id)',
  'const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id)',
  'blocked_reason: "enterprise_mismatch"',
  'dispatch_status: "expire"',
  'statut: livreur.manual_hors_ligne === true ? "hors_ligne" : "disponible"',
  'envoiNotificationPush',
  'type: "course_annulee"',
]) {
  if (!annulerCourse.includes(needle)) fail(`enterprise_cancel_backend_missing needle=${needle}`);
}

const enterpriseCourseModal = text('src/components/enterprise/CourseDetailModal.jsx');
for (const needle of [
  'onRefresh',
  'base44.functions.invoke("annulerCourseExterne"',
  'source: "admin"',
  'motif: "annulation_admin_enterprise"',
  'const isCancellable = course.statut !== "annulee" && course.statut !== "livree"',
  'Annuler la course',
  'Voulez-vous vraiment annuler cette course ?',
  'Confirmer l\'annulation',
  'onRefresh?.()',
]) {
  if (!enterpriseCourseModal.includes(needle)) fail(`enterprise_cancel_frontend_missing needle=${needle}`);
}
if (enterpriseCourseModal.includes('window.location')) fail('enterprise_cancel_full_reload_introduced');

const enterpriseApp = text('src/pages/EntrepriseApp.jsx');
if (!enterpriseApp.includes('onRefresh={loadDashboard}')) fail('enterprise_cancel_refresh_not_wired');

console.log('FINAL_ENTERPRISE_RELEASE_GUARDS=PASS');
