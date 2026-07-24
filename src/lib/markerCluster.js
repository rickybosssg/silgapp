/**
 * Utilitaire de regroupement de marqueurs pour Leaflet.
 * Regroupe les marqueurs proches (en pixels) pour éviter la superposition.
 */

/**
 * Calcule les clusters de marqueurs basés sur la distance pixel.
 * @param {Array} items - Items avec { latitude, longitude, ... }
 * @param {Object} map - Instance Leaflet
 * @param {number} threshold - Distance pixel minimale (défaut: 45px)
 * @returns {Array} - Clusters: { type: 'cluster'|'single', items?, item?, latitude, longitude, count }
 */
export function calculateClusters(items, map, threshold = 45) {
  if (!map || !items.length) return [];

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