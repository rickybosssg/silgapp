import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    // Lire le token depuis les query params ou le body JSON
    let token = url.searchParams.get('token');

    if (!token) {
      try {
        const body = await req.clone().json();
        token = body.token;
      } catch (_) {}
    }

    if (!token) {
      return new Response(errorHtml('Token manquant'), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Valider le token
    const tokens = await base44.asServiceRole.entities.DemoAccess.filter({ token, actif: true });

    if (tokens.length === 0) {
      return new Response(errorHtml('Lien invalide'), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const t = tokens[0];
    if (new Date(t.expire_le) < new Date()) {
      await base44.asServiceRole.entities.DemoAccess.update(t.id, { actif: false });
      return new Response(errorHtml('Lien expiré'), {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Récupérer les stats
    const [clients, livreurs, courses, pays] = await Promise.all([
      base44.asServiceRole.entities.ClientExterne.list(),
      base44.asServiceRole.entities.Livreur.list(),
      base44.asServiceRole.entities.CourseExterne.list('-created_date', 500),
      base44.asServiceRole.entities.Country.list('ordre'),
    ]);

    const clientsActifs = clients.filter(c => c.actif).length;
    const livreursValides = livreurs.filter(l => l.validation === 'valide' && l.actif).length;
    const coursesLivrees = courses.filter(c => c.statut === 'livree');
    const coursesAnnulees = courses.filter(c => c.statut === 'annulee').length;
    const coursesEnCoursCount = courses.filter(c => !['nouvelle', 'annulee', 'livree', 'programmee'].includes(c.statut)).length;
    const paysUniques = [...new Set(courses.filter(c => c.country_code).map(c => c.country_code))];
    const paysActifs = pays.filter(p => p.actif);

    const ilYa30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const coursesRecentes = courses.filter(c => new Date(c.created_date) >= ilYa30Jours);

    const coursesExpedier = courses.filter(c => c.type_course === 'expedier').length;
    const coursesRecevoir = courses.filter(c => c.type_course === 'recevoir').length;
    const coursesDeplacement = courses.filter(c => c.type_course === 'deplacement').length;

    const statsByPays = paysActifs.map(p => {
      const crs = courses.filter(c => c.country_code === p.code);
      const lvres = crs.filter(c => c.statut === 'livree');
      const lvrs = livreurs.filter(l => l.country_code === p.code && l.validation === 'valide');
      const cls = clients.filter(c => c.country_code === p.code);
      return {
        code: p.code,
        nom: p.nom,
        emoji: p.emoji_flag || '',
        courses: crs.length,
        livrees: lvres.length,
        livreurs: lvrs.length,
        clients: cls.length,
      };
    }).sort((a, b) => b.courses - a.courses);

    const dernieresLivrees = coursesLivrees
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 10)
      .map(c => `
        <tr>
          <td>${new Date(c.created_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td><span class="badge">${c.type_course === 'expedier' ? ' Expédition' : c.type_course === 'recevoir' ? ' Réception' : ' Déplacement'}</span></td>
          <td>${c.country_code || '-'}</td>
          <td>${c.client_nom || '-'}</td>
          <td><span class="badge badge-green">Livrée</span></td>
        </tr>
      `).join('');

    const masquerTel = (tel) => {
      if (!tel) return '-';
      // Garder les 2 derniers chiffres, remplacer le reste par XX
      const cleaned = tel.replace(/\s/g, '');
      if (cleaned.length <= 2) return tel;
      const visible = cleaned.slice(-2);
      const masked = cleaned.slice(0, -2).replace(/\d/g, 'X');
      // Reformater avec espaces tous les 2 car.
      const full = masked + visible;
      const parts = [];
      for (let i = 0; i < full.length; i += 2) {
        parts.push(full.slice(i, i + 2));
      }
      return parts.join(' ');
    };

    const tableClients = clients
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 15)
      .map(c => `
        <tr>
          <td>${c.nom || '-'} ${c.prenom || ''}</td>
          <td>${masquerTel(c.telephone)}</td>
          <td>${c.ville || '-'}</td>
          <td>${c.country_code || '-'}</td>
          <td><span class="badge ${c.actif ? 'badge-green' : 'badge-red'}">${c.actif ? 'Actif' : 'Inactif'}</span></td>
          <td>${c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '-'}</td>
        </tr>
      `).join('');

    const tableLivreurs = livreurs
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 15)
      .map(l => `
        <tr>
          <td>${l.nom || '-'} ${l.prenom || ''}</td>
          <td>${masquerTel(l.telephone)}</td>
          <td>${l.ville || '-'}</td>
          <td>${l.country_code || '-'}</td>
          <td><span class="badge ${l.validation === 'valide' ? 'badge-green' : l.validation === 'en_attente' ? 'badge-orange' : 'badge-red'}">${l.validation === 'valide' ? 'Validé' : l.validation === 'en_attente' ? 'En attente' : 'Refusé'}</span></td>
          <td><span class="badge ${l.statut === 'disponible' ? 'badge-green' : l.statut === 'en_course' ? 'badge-blue' : 'badge-gray'}">${l.statut === 'disponible' ? 'Disponible' : l.statut === 'en_course' ? 'En course' : 'Hors ligne'}</span></td>
        </tr>
      `).join('');

    const paysRows = statsByPays.map(p => `
      <div class="pays-card">
        <span class="flag">${p.emoji}</span>
        <div>
          <strong>${p.nom}</strong>
          <small>${p.courses} courses · ${p.livrees} livrées · ${p.livreurs} livreurs · ${p.clients} clients</small>
        </div>
      </div>
    `).join('');

    const derniereConnexion = Math.max(
      ...clients.filter(c => c.last_seen_at).map(c => new Date(c.last_seen_at).getTime()),
      ...livreurs.filter(l => l.last_seen_at).map(l => new Date(l.last_seen_at).getTime()),
      0
    );

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SILGAPP - Dashboard Démo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;color:#1d1d1f}
.banner{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);color:#fff;padding:24px 20px}
.banner-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.banner h1{font-size:22px;font-weight:800}
.banner sub{font-size:12px;opacity:.7}
.live-badge{background:rgba(34,197,94,.2);color:#4ade80;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid rgba(34,197,94,.3)}
.main{max-width:1100px;margin:0 auto;padding:20px}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.kpi-card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.kpi-color{height:3px;border-radius:99px;margin-bottom:10px}
.kpi-label{font-size:10px;text-transform:uppercase;color:#86868b;font-weight:600}
.kpi-value{font-size:28px;font-weight:800;color:#1d1d1f;margin:4px 0}
.kpi-sub{font-size:11px;color:#86868b}
.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.04);margin-bottom:16px}
.card-title{font-size:15px;font-weight:700;margin-bottom:14px;color:#1d1d1f}
.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.type-card{border-radius:14px;padding:16px;text-align:center}
.type-card.blue{background:#eff6ff;color:#1e40af}
.type-card.green{background:#f0fdf4;color:#166534}
.type-card.purple{background:#faf5ff;color:#6b21a8}
.type-icon{font-size:28px}
.type-val{font-size:24px;font-weight:800;margin:4px 0}
.type-label{font-size:11px;opacity:.7}
.pays-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.pays-card{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f9fafb;border-radius:12px}
.pays-card .flag{font-size:22px;flex-shrink:0}
.pays-card strong{font-size:13px;display:block}
.pays-card small{font-size:11px;color:#86868b}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 10px;color:#86868b;font-weight:600;font-size:11px;border-bottom:1px solid #e5e7eb}
td{padding:8px 10px;border-bottom:1px solid #f3f4f6}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;border:1px solid #d1d5db;color:#4b5563}
.badge-green{background:#dcfce7;color:#166534;border-color:#bbf7d0}
 .badge-orange{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
 .badge-red{background:#fef2f2;color:#991b1b;border-color:#fecaca}
 .badge-blue{background:#eff6ff;color:#1e40af;border-color:#bfdbfe}
 .badge-gray{background:#f3f4f6;color:#4b5563;border-color:#d1d5db}
 .section-title{font-size:14px;font-weight:700;margin-bottom:4px;color:#1d1d1f}
 .section-subtitle{font-size:11px;color:#86868b;margin-bottom:12px}
 footer{text-align:center;padding:30px;font-size:11px;color:#9ca3af}
a{color:#ef4444;text-decoration:none}
@media(max-width:640px){.kpi-grid{grid-template-columns:repeat(2,1fr)}.type-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="banner">
<div class="banner-inner">
<div style="display:flex;align-items:center;gap:10px">
<span style="font-size:28px"></span>
<div>
<h1>SILGAPP</h1>
<sub>Dashboard de démonstration — Closed Testing Google Play</sub>
</div>
</div>
<span class="live-badge"> Données réelles en direct</span>
</div>
</div>

<div class="main">

<div class="kpi-grid">
<div class="kpi-card"><div class="kpi-color" style="background:linear-gradient(90deg,#8b5cf6,#a855f7)"></div><span class="kpi-label"> Clients</span><div class="kpi-value">${clients.length}</div><div class="kpi-sub">${clientsActifs} actifs</div></div>
<div class="kpi-card"><div class="kpi-color" style="background:linear-gradient(90deg,#3b82f6,#6366f1)"></div><span class="kpi-label"> Livreurs</span><div class="kpi-value">${livreurs.length}</div><div class="kpi-sub">${livreursValides} validés</div></div>
<div class="kpi-card"><div class="kpi-color" style="background:linear-gradient(90deg,#f97316,#f59e0b)"></div><span class="kpi-label"> Courses</span><div class="kpi-value">${courses.length}</div><div class="kpi-sub">${coursesLivrees.length} livrées</div></div>
<div class="kpi-card"><div class="kpi-color" style="background:linear-gradient(90deg,#10b981,#14b8a6)"></div><span class="kpi-label"> Pays</span><div class="kpi-value">${paysUniques.length}</div><div class="kpi-sub">couverts</div></div>
<div class="kpi-card"><div class="kpi-color" style="background:linear-gradient(90deg,#06b6d4,#0ea5e9)"></div><span class="kpi-label">⏳ En cours</span><div class="kpi-value">${coursesEnCoursCount}</div><div class="kpi-sub">actives</div></div>
<div class="kpi-card"><div class="kpi-color" style="background:linear-gradient(90deg,#f43f5e,#ec4899)"></div><span class="kpi-label"> 30j</span><div class="kpi-value">${coursesRecentes.length}</div><div class="kpi-sub">courses récentes</div></div>
</div>

<div class="card">
<div class="card-title"> Répartition par type de course</div>
<div class="type-grid">
<div class="type-card blue"><div class="type-icon"></div><div class="type-val">${coursesExpedier}</div><div class="type-label">Expéditions</div></div>
<div class="type-card green"><div class="type-icon"></div><div class="type-val">${coursesRecevoir}</div><div class="type-label">Réceptions</div></div>
<div class="type-card purple"><div class="type-icon"></div><div class="type-val">${coursesDeplacement}</div><div class="type-label">Déplacements</div></div>
</div>
</div>

<div class="card">
<div class="card-title"> Performance par pays</div>
<div class="pays-grid">${paysRows}</div>
</div>

<div class="card">
<div class="card-title"> Dernières courses livrées</div>
<table>
<thead><tr><th>Date</th><th>Type</th><th>Pays</th><th>Client</th><th>Statut</th></tr></thead>
<tbody>${dernieresLivrees}</tbody>
</table>
</div>

<div class="card">
<div class="section-title"> Clients inscrits</div>
<div class="section-subtitle">${clients.length} clients · ${clientsActifs} actifs · Affichage des 15 plus récents</div>
<table>
<thead><tr><th>Nom</th><th>Téléphone</th><th>Ville</th><th>Pays</th><th>Statut</th><th>Vu le</th></tr></thead>
<tbody>${tableClients}</tbody>
</table>
</div>

<div class="card">
<div class="section-title"> Livreurs inscrits</div>
<div class="section-subtitle">${livreurs.length} livreurs · ${livreursValides} validés · Affichage des 15 plus récents</div>
<table>
<thead><tr><th>Nom</th><th>Téléphone</th><th>Ville</th><th>Pays</th><th>Validation</th><th>Statut</th></tr></thead>
<tbody>${tableLivreurs}</tbody>
</table>
</div>

</div>

<footer>
SILGAPP — Dashboard démo généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
${derniereConnexion > 0 ? ' · Dernière activité : ' + new Date(derniereConnexion).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
<br>Plateforme logistique de livraison dernier kilomètre — Afrique de l'Ouest
</footer>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error) {
    console.error('[servirDemoPage] Erreur:', error);
    return new Response(errorHtml('Erreur serveur : ' + error.message), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});

function errorHtml(message) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>SILGAPP - Erreur</title>
<style>body{font-family:-apple-system,sans-serif;background:#f5f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#fff;padding:40px;border-radius:20px;text-align:center;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,.06)}.icon{font-size:48px;margin-bottom:12px}h1{font-size:18px;color:#1d1d1f;margin-bottom:8px}p{font-size:14px;color:#86868b}</style>
</head>
<body><div class="card"><div class="icon"></div><h1>${message}</h1><p>Ce lien n'est plus valide. Il a peut-être expiré ou a été révoqué.</p></div></body>
</html>`;
}
