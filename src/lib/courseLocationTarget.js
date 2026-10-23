// Calling a contact does not authorize using their live position as the destination.
export function getCourseLocationTarget(course, phase, contactTelephone = "") {
  if (course?.commande_vocale_express === true) return { telephone: "", clientId: null };
  return {
    telephone: contactTelephone || "",
    clientId: (phase === "livraison" ? course?.destinataire_client_id : course?.expediteur_client_id) || null,
  };
}
