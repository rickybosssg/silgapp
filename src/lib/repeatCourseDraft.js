export function buildRepeatCourseDraft(course) {
  if (!course || course.statut !== 'livree') return null;
  const type = ['expedier', 'recevoir', 'deplacement'].includes(course.type_course) ? course.type_course : 'expedier';
  const fields = ['adresse_depart','adresse_arrivee','quartier_depart','quartier_arrivee','ville_depart','ville_arrivee','expediteur_nom','expediteur_telephone','destinataire_nom','destinataire_telephone','passager_nom','passager_telephone'];
  const draft = Object.fromEntries(fields.map(key => [key, typeof course[key] === 'string' ? course[key] : '']));
  const price = course.prix_propose_client;
  return {
    ...draft, type_course: type, type_colis: course.type_colis || 'petit_colis',
    nb_passagers: course.nb_passagers || 1, notes: '',
    destination_inconnue: course.destination_inconnue === true,
    delivery_mode: type !== 'deplacement' && course.delivery_mode === 'eco' ? 'eco' : 'standard',
    prix_propose_client: typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : 0,
    ...Object.fromEntries(['depart','arrivee'].flatMap(side => {
      const exact = ['exact','geocodage'].includes(course[`gps_${side}_source`]);
      return [[`gps_${side}_source`, exact ? course[`gps_${side}_source`] : null],
        ...['lat','lng'].map(axis => [`gps_${side}_${axis}`, exact && Number.isFinite(course[`gps_${side}_${axis}`]) ? course[`gps_${side}_${axis}`] : null])];
    })),
  };
}
