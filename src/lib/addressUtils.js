/**
 * Nettoie une adresse pour l'affichage.
 * Si l'adresse est un lien Google Maps (ou toute URL), on l'masque et
 * affiche à la place le nom du lieu extrait de l'URL, ou les coordonnées GPS.
 *
 * @param {string} address - L'adresse brute (peut contenir une URL)
 * @param {number|null} lat - Latitude de fallback
 * @param {number|null} lng - Longitude de fallback
 * @returns {string} - Adresse lisible
 */
export function cleanAddress(address, lat = null, lng = null) {
  if (!address) return "—";
  const trimmed = address.trim();
  if (!trimmed) return "—";

  // Si c'est une URL (Google Maps, etc.), ne jamais l'afficher
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      // Essayer d'extraire un nom de lieu depuis les paramètres
      const query =
        url.searchParams.get("q") ||
        url.searchParams.get("query") ||
        url.searchParams.get("text") ||
        url.searchParams.get("place");
      if (query && !query.match(/^-?\d+\.\d+,-?\d+\.\d+$/)) {
        return decodeURIComponent(query).replace(/\+/g, " ");
      }
      // Vérifier le path pour un nom de lieu
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        const last = pathParts[pathParts.length - 1];
        if (last && last !== "maps" && !last.match(/^\d/)) {
          return decodeURIComponent(last).replace(/\+/g, " ");
        }
      }
    } catch {
      // URL invalide, continuer
    }
    // Fallback : coordonnées GPS si disponibles
    if (lat && lng) return `📍 Position GPS`;
    return "📍 Position GPS";
  }

  // Si l'adresse n'est que des coordonnées GPS
  if (trimmed.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
    return "📍 Position GPS";
  }

  return trimmed;
}