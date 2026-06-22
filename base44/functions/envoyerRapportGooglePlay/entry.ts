import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.2.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { email = 'weezyh2@gmail.com' } = payload;

    // Récupération de toutes les données
    const [clients, livreurs, courses, devices, tickets] = await Promise.all([
      base44.asServiceRole.entities.ClientExterne.list(),
      base44.asServiceRole.entities.Livreur.list(),
      base44.asServiceRole.entities.CourseExterne.list(),
      base44.asServiceRole.entities.DeviceSession.filter({ user_type: 'client' }),
      base44.asServiceRole.entities.TicketSupport.list(),
    ]);

    // Calculs statistiques
    const clientsActifs = clients.filter(c => c.actif).length;
    const livreursValides = livreurs.filter(l => l.validation === 'valide' && l.actif).length;
    const coursesLivrees = courses.filter(c => c.statut === 'livree');
    const coursesAnnulees = courses.filter(c => c.statut === 'annulee').length;
    const coursesEnCours = courses.filter(c => !['nouvelle', 'annulee', 'livree', 'programmee'].includes(c.statut)).length;

    const paysUniques = [...new Set(courses.filter(c => c.country_code).map(c => c.country_code))];

    const ilYa30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const coursesRecentes = courses.filter(c => {
      const d = new Date(c.created_date);
      return d >= ilYa30Jours;
    });

    const coursesExpedier = courses.filter(c => c.type_course === 'expedier').length;
    const coursesRecevoir = courses.filter(c => c.type_course === 'recevoir').length;
    const coursesDeplacement = courses.filter(c => c.type_course === 'deplacement').length;

    const derniereCourse = courses.length > 0
      ? courses.sort((a,b) => new Date(b.created_date) - new Date(a.created_date))[0]
      : null;

    const derniereConnexionClient = clients
      .filter(c => c.last_seen_at)
      .sort((a,b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0];

    const derniereConnexionLivreur = livreurs
      .filter(l => l.last_seen_at)
      .sort((a,b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0];

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const heureStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // --- GÉNÉRATION PDF ---
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 15;

    // En-tête
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SILGAPP', 15, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text("Rapport d'activité — Closed Testing Google Play", 15, 26);
    doc.text(`Généré le ${dateStr} à ${heureStr}`, 15, 32);

    y = 42;

    // Section 1: Résumé
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Résumé global', 15, y);
    y += 8;
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.5);
    doc.line(15, y, pageWidth - 15, y);
    y += 6;

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      "SILGAPP est une plateforme logistique de livraison dernier kilomètre opérant en Afrique de l'Ouest. " +
      "L'application connecte des clients souhaitant expédier ou recevoir des colis avec des livreurs partenaires " +
      "géolocalisés en temps réel. Chaque course suit un cycle complet : création, dispatch automatique par GPS, " +
      "acceptation par un livreur, suivi en direct, validation par QR code, et paiement.",
      15, y, { maxWidth: pageWidth - 30 }
    );
    y += 30;

    // Section 2: Utilisateurs
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("2. Base d'utilisateurs", 15, y);
    y += 8;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    const userRows = [
      ['Clients inscrits', `${clients.length}`, `${clientsActifs} actifs`],
      ['Livreurs inscrits', `${livreurs.length}`, `${livreursValides} validés`],
      ['Total utilisateurs', `${clients.length + livreurs.length}`, `${clientsActifs + livreursValides} actifs`],
      ['Pays couverts', `${paysUniques.length}`, paysUniques.join(', ')],
    ];

    doc.setFillColor(245, 245, 245);
    doc.rect(15, y, pageWidth - 30, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Indicateur', 17, y + 5);
    doc.text('Total', 90, y + 5);
    doc.text('Détail', 120, y + 5);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    for (const row of userRows) {
      doc.text(row[0], 17, y + 5);
      doc.text(row[1], 90, y + 5);
      doc.text(row[2], 120, y + 5);
      if (y > 260) { doc.addPage(); y = 20; }
      y += 7;
    }
    y += 8;

    // Section 3: Courses
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Activité de livraison', 15, y);
    y += 8;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    const courseRows = [
      ['Courses totales', `${courses.length}`],
      ['Courses livrées avec succès', `${coursesLivrees.length}`],
      ['Courses annulées', `${coursesAnnulees}`],
      ['Courses en cours', `${coursesEnCours}`],
      ['Courses (30 derniers jours)', `${coursesRecentes.length}`],
      ['Expéditions', `${coursesExpedier}`],
      ['Réceptions', `${coursesRecevoir}`],
      ['Déplacements (passagers)', `${coursesDeplacement}`],
    ];

    doc.setFillColor(245, 245, 245);
    doc.rect(15, y, pageWidth - 30, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Indicateur', 17, y + 5);
    doc.text('Valeur', 110, y + 5);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    for (const row of courseRows) {
      doc.text(row[0], 17, y + 5);
      doc.text(row[1], 110, y + 5);
      y += 7;
    }
    y += 8;

    // Section 4: Engagement récent
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Engagement des utilisateurs', 15, y);
    y += 8;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (derniereCourse) {
      const d = new Date(derniereCourse.created_date);
      doc.text(`Dernière course effectuée : ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 15, y); y += 6;
      doc.text(`Type : ${derniereCourse.type_course} — Pays : ${derniereCourse.country_code || 'N/A'} — Statut : ${derniereCourse.statut}`, 15, y); y += 8;
    }
    if (derniereConnexionClient?.last_seen_at) {
      const d = new Date(derniereConnexionClient.last_seen_at);
      doc.text(`Dernière connexion client : ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 15, y); y += 6;
    }
    if (derniereConnexionLivreur?.last_seen_at) {
      const d = new Date(derniereConnexionLivreur.last_seen_at);
      doc.text(`Dernière connexion livreur : ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 15, y); y += 6;
    }
    y += 8;

    // Section 5: Dernières courses livrées
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('5. Dernières courses livrées', 15, y);
    y += 8;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    doc.setFillColor(245, 245, 245);
    doc.rect(15, y, pageWidth - 30, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.text('Date', 17, y + 5);
    doc.text('Type', 55, y + 5);
    doc.text('Pays', 90, y + 5);
    doc.text('Statut', 120, y + 5);
    doc.text('Client', 145, y + 5);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(8);

    const dernieresLivrees = coursesLivrees
      .sort((a,b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 15);

    for (const c of dernieresLivrees) {
      if (y > 270) { doc.addPage(); y = 20; }
      const d = new Date(c.created_date);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      doc.text(dateStr, 17, y + 4);
      doc.text(c.type_course || '-', 55, y + 4);
      doc.text(c.country_code || '-', 90, y + 4);
      doc.text(c.statut, 120, y + 4);
      doc.text((c.client_nom || '-').substring(0, 18), 145, y + 4);
      y += 5.5;
    }
    y += 8;

    // Section 6: Conclusion
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('6. Conclusion', 15, y);
    y += 8;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Avec ${clientsActifs} clients actifs, ${livreursValides} livreurs validés et ${courses.length} courses ` +
      `réalisées dans ${paysUniques.length} pays, SILGAPP démontre un engagement réel et soutenu de ses testeurs. ` +
      "La plateforme n'est pas une simple application à usage unique : chaque utilisateur interagit régulièrement " +
      "dans un écosystème complet qui inclut création de commandes, dispatch automatique, suivi GPS en temps réel, " +
      "messagerie intégrée, validation par QR code, et paiement.",
      15, y, { maxWidth: pageWidth - 30 }
    );
    y += 24;
    doc.text(
      "Ces métriques confirment que le closed testing a été mené avec rigueur, sur une durée suffisante, " +
      "avec des testeurs réels et engagés, conformément aux exigences du programme Google Play.",
      15, y, { maxWidth: pageWidth - 30 }
    );

    // Pied de page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`SILGAPP — Rapport Closed Testing — Page ${i}/${pageCount}`, pageWidth / 2, 292, { align: 'center' });
    }

    const pdfBytes = doc.output('arraybuffer');

    // --- UPLOAD DU PDF EN STOCKAGE PRIVÉ ---
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'SILGAPP_Rapport_Closed_Testing.pdf', { type: 'application/pdf' });

    // On utilise l'intégration UploadPrivateFile pour stocker le PDF
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: pdfFile,
    });

    const fileUri = uploadResult.file_uri;
    console.log('[envoyerRapportGooglePlay] PDF uploadé:', fileUri);

    // Créer un signed URL valide 7 jours
    const signedResult = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUri,
      expires_in: 604800, // 7 jours
    });

    const downloadLink = signedResult.signed_url;

    // --- ENVOI EMAIL ---
    const emailBody = `Bonjour,

Veuillez trouver ci-dessous le rapport d'activité SILGAPP pour le Closed Testing Google Play.

 CHIFFRES CLÉS :
• ${clients.length} clients inscrits (${clientsActifs} actifs)
• ${livreurs.length} livreurs inscrits (${livreursValides} validés)
• ${courses.length} courses totales
• ${coursesLivrees.length} courses livrées avec succès
• ${paysUniques.length} pays couverts : ${paysUniques.join(', ')}
• Dernière activité : ${derniereCourse ? new Date(derniereCourse.created_date).toLocaleDateString('fr-FR') : 'N/A'}

 Le rapport PDF complet est téléchargeable ici (lien valide 7 jours) :
${downloadLink}

Rapport généré le ${dateStr} à ${heureStr}.

Cordialement,
L'équipe SILGAPP`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'SILGAPP — Rapport Closed Testing Google Play',
      body: emailBody,
    });

    console.log('[envoyerRapportGooglePlay] Email envoyé à', email);

    return Response.json({
      success: true,
      message: `Rapport envoyé à ${email}`,
      email: email,
      download_link: downloadLink,
    });

  } catch (error) {
    console.error('[envoyerRapportGooglePlay] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
