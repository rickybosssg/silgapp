// Only maps the allowlisted private DTO; never supplies entity IDs or account identities.
export function guestCoursePresentation(c) {
  return { ...c, private_guest: true, type_course: 'expedier', adresse_depart: c.depart, adresse_arrivee: c.arrivee,
    gps_depart_lat: c.depart_position?.lat, gps_depart_lng: c.depart_position?.lng,
    gps_arrivee_lat: c.arrivee_position?.lat, gps_arrivee_lng: c.arrivee_position?.lng,
    heure_sollicitation: c.search_at, heure_recuperation: c.pickup_at,
    livreur_nom: c.driver?.name, livreur_photo_url: c.driver?.photo, livreur_telephone: c.driver?.telephone,
    livreur_vehicule: c.driver?.vehicle, livreur_note_moyenne: c.driver?.rating, livreur_nombre_avis: c.driver?.review_count,
    _livreur: c.driver_position ? { latitude: c.driver_position.lat, longitude: c.driver_position.lng, derniere_position_date: c.driver_position.acquired_at } : null };
}
