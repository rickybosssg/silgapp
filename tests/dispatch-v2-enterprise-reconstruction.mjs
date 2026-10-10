import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fail = (msg) => {
  console.error(`DISPATCH_V2_ENTERPRISE_RECONSTRUCTION=FAIL ${msg}`);
  process.exit(1);
};

const text = (path) => readFileSync(path, 'utf8');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const runtimeFiles = [
  'base44/functions/dispatchExterneAuto/entry.ts',
  'base44/functions/courseEventOrchestrator/entry.ts',
  'base44/shared/dispatchWatchdog.ts',
];

for (const file of runtimeFiles) {
  const content = text(file);
  if (content.includes('lancerDispatchMulti')) {
    fail(`v1_runtime_call_found file=${file}`);
  }
  if (content.includes('dispatchEngine.ts')) {
    fail(`v1_runtime_import_found file=${file}`);
  }
  if (content.includes('isV2Enabled(')) {
    fail(`v2_feature_flag_runtime_found file=${file}`);
  }
}

const dispatchV2 = text('base44/shared/dispatchV2.ts');
for (const needle of [
  'normalizeEnterpriseId(course.enterprise_id)',
  'normalizeEnterpriseId(livreur.enterprise_id) === courseEnterpriseId',
  "reason: 'enterprise_mismatch'",
  'checkEnterpriseActive',
]) {
  if (!dispatchV2.includes(needle)) fail(`missing_enterprise_isolation needle=${needle}`);
}

const coursesDisponibles = text('src/hooks/useCoursesDisponibles.js');
for (const needle of [
  'function normalizeEnterpriseId(val)',
  'const livreurEnterpriseId = normalizeEnterpriseId(livreurProfil?.enterprise_id)',
  '["courses-externes-disponibles", livreurId, countryCode, livreurEnterpriseId, isV2Enabled]',
  'normalizeEnterpriseId(course.enterprise_id) !== livreurEnterpriseId',
]) {
  if (!coursesDisponibles.includes(needle)) fail(`missing_frontend_enterprise_isolation needle=${needle}`);
}

const rootCapacitor = text('capacitor.config.json');
if (rootCapacitor.includes('"url"') || rootCapacitor.includes('server.url')) {
  fail('root_capacitor_server_url_introduced');
}

const diffNames = git('diff', '--name-only', '978abc53');
const changed = diffNames ? diffNames.split(/\r?\n/).filter(Boolean) : [];
const forbiddenPrefixes = [
  'android/',
  'ios/',
];
for (const file of changed) {
  if (file === 'android/app/build.gradle') {
    continue;
  }
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    fail(`native_diff_not_allowed file=${file}`);
  }
  if (/\.(css|scss|sass|less)$/.test(file)) {
    fail(`public_style_file_modified file=${file}`);
  }
}

const allowedHistoricalFrontend = new Set([
  'src/App.jsx',
  'src/components/auth/AuthGate.jsx',
  'src/components/chat/ChatWindow.jsx',
  'src/components/layout/Sidebar.jsx',
  'src/components/livreur/LivreurHistorique.jsx',
  'src/components/livreur/LivreurStatsBanner.jsx',
  'src/components/livreur/LivreurVictoryOverlay.jsx',
  'src/hooks/useCoursesDisponibles.js',
  'src/pages/LivreurExterneApp.jsx',
]);
for (const file of changed.filter((f) =>
  f.startsWith('src/') &&
  !f.startsWith('src/components/enterprise/') &&
  !f.startsWith('src/pages/EntrepriseApp.jsx') &&
  !f.startsWith('src/pages/InscriptionLivreurEntreprise.jsx') &&
  !f.startsWith('src/pages/SuiviEnterprise.jsx') &&
  !f.startsWith('src/pages/SuperAdminEntreprises.jsx')
)) {
  if (!allowedHistoricalFrontend.has(file)) {
    fail(`unexpected_public_frontend_diff file=${file}`);
  }
}

console.log(`DISPATCH_V2_ENTERPRISE_RECONSTRUCTION=PASS changed_files=${changed.length}`);
