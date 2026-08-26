/**
 * Utilitaire de regroupement de marqueurs pour Leaflet.
 * Regroupe les marqueurs proches (en pixels) pour éviter la superposition.
 *
 * Clustering progressif : le seuil de regroupement augmente quand l'utilisateur
 * dézoome, et diminue quand il zoome. Cela permet d'avoir une carte lisible
 * à tous les niveaux de zoom.
 */

/**
 * Retourne le seuil de regroupement (en pixels) adapté au niveau de zoom.
 * - Zoom élevé (≥15) : seuil faible (45px) — marqueurs individuels
 * - Zoom moyen (13-14) : seuil intermédiaire (80px)
 * - Zoom faible (≤12) : seuil important (120px) — regroupement agressif
 */
export function getClusterThreshold(zoom) {
  if (!zoom || zoom >= 15) return 45;
  if (zoom >= 13) return 80;
  return 120;
}

/**
 * Calcule les clusters de marqueurs basés sur la distance pixel.
 * @param {Array} items - Items avec { latitude, longitude, ... }
 * @param {Object} map - Instance Leaflet
 * @param {number} threshold - Distance pixel minimale (si omis, calculé depuis le zoom)
 * @returns {Array} - Clusters: { type: 'cluster'|'single', items?, item?, latitude, longitude, count }
 */
export function calculateClusters(items, map, threshold) {
  if (!map || !items.length) return [];

  if (!threshold) {
    threshold = getClusterThreshold(map.getZoom());
  }

  const clusters = [];
  const processed = new Set();

  for (let i = 0; i < items.length; i++) {
    if (processed.has(i)) continue;

    const point = map.latLngToLayerPoint([items[i].latitude, items[i].longitude]);
    const cluster = [items[i]];
    processed.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (processed.has(j)) continue;
      if (!items[j].latitude || !items[j].longitude) continue;
      const otherPoint = map.latLngToLayerPoint([items[j].latitude, items[j].longitude]);
      const dx = point.x - otherPoint.x;
      const dy = point.y - otherPoint.y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        cluster.push(items[j]);
        processed.add(j);
      }
    }

    if (cluster.length > 1) {
      const avgLat = cluster.reduce((s, c) => s + c.latitude, 0) / cluster.length;
      const avgLng = cluster.reduce((s, c) => s + c.longitude, 0) / cluster.length;
      clusters.push({ type: "cluster", items: cluster, latitude: avgLat, longitude: avgLng, count: cluster.length });
    } else {
      clusters.push({ type: "single", item: cluster[0], latitude: cluster[0].latitude, longitude: cluster[0].longitude });
    }
  }

  return clusters;
}