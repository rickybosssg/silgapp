export const SERVICE_IDS = ['boutique', 'restaurant'];
export const FLOATING_STORAGE_KEY = 'silgapp.client.service-floaters.v1';
export const DRAG_THRESHOLD = 7;
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function readFloatingPreferences(raw) {
  try {
    const data = JSON.parse(raw || '{}');
    return Object.fromEntries(SERVICE_IDS.filter(id => finite(data?.[id]?.x) && finite(data?.[id]?.y))
      .map(id => [id, { x: Math.max(0, Math.min(1, data[id].x)), y: Math.max(0, Math.min(1, data[id].y)) }]));
  } catch { return {}; }
}
export function clampPoint(point, bounds, size) {
  return { x: Math.max(bounds.left, Math.min(bounds.right - size.width, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom - size.height, point.y)) };
}
export function normalizedPoint(point, bounds, size) {
  return { x: Math.max(0, Math.min(1, (point.x - bounds.left) / Math.max(1, bounds.right - bounds.left - size.width))),
    y: Math.max(0, Math.min(1, (point.y - bounds.top) / Math.max(1, bounds.bottom - bounds.top - size.height))) };
}
export function overlaps(a, b, gap = 8) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}
export function defaultPoint(id, bounds, size) {
  const room = bounds.right - bounds.left;
  const pair = size.width * 2 + 12;
  if (pair > room) return { x: bounds.left + (room - size.width) / 2,
    y: bounds.bottom - size.height - (id === 'boutique' ? size.height + 12 : 0) };
  return { x: bounds.left + (room - pair) / 2 + (id === 'restaurant' ? size.width + 12 : 0),
    y: bounds.bottom - size.height };
}
export function preferredPoint(id, saved, bounds, size) {
  return saved?.[id] ? { x: bounds.left + saved[id].x * Math.max(0, bounds.right - bounds.left - size.width),
    y: bounds.top + saved[id].y * Math.max(0, bounds.bottom - bounds.top - size.height) } : defaultPoint(id, bounds, size);
}
// Candidate edges cover each free rectangle. If no safe space exists, don't cover
// a protected action: its original in-page shop/restaurant shortcut still works.
export function findSafePoint(desired, bounds, size, obstacles) {
  if (size.width > bounds.right - bounds.left || size.height > bounds.bottom - bounds.top) return null;
  const p = clampPoint(desired, bounds, size);
  const xs = [p.x, bounds.left, bounds.right - size.width];
  const ys = [p.y, bounds.top, bounds.bottom - size.height];
  for (const r of obstacles) {
    xs.push(r.x - size.width - 8, r.x + r.width + 8);
    ys.push(r.y - size.height - 8, r.y + r.height + 8);
  }
  let best = null, distance = Infinity;
  for (const x of xs) for (const y of ys) {
    if (x < bounds.left || y < bounds.top || x + size.width > bounds.right || y + size.height > bounds.bottom) continue;
    const candidate = { x, y, ...size };
    if (obstacles.some(r => overlaps(candidate, r))) continue;
    const d = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (d < distance) { distance = d; best = { x, y }; }
  }
  return best;
}
export function placeFloaters(bounds, size, preferences = {}, obstacles = [], priority = 'boutique') {
  const result = {};
  const occupied = [...obstacles];
  for (const id of [priority, ...SERVICE_IDS.filter(id => id !== priority)]) {
    const point = findSafePoint(preferredPoint(id, preferences, bounds, size), bounds, size, occupied);
    result[id] = point;
    if (point) occupied.push({ ...point, ...size });
  }
  return result;
}

