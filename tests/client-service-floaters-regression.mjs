import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFloatingPreferences, clampPoint, normalizedPoint, overlaps, defaultPoint, findSafePoint, placeFloaters } from '../src/lib/clientServiceFloaters.js';
const bounds = { left: 12, top: 12, right: 378, bottom: 828 };
const size = { width: 170, height: 52 };
test('saved positions reject malformed values and clamp finite ratios', () => {
  for (const raw of ['no json', 'null', '{"boutique":{"x":"1","y":0}}', '{"restaurant":{"x":null,"y":0}}']) assert.deepEqual(readFloatingPreferences(raw), {});
  assert.deepEqual(readFloatingPreferences('{"boutique":{"x":-2,"y":9},"unknown":{"x":0,"y":0}}'), { boutique: { x: 0, y: 1 } });
});
test('two default shortcuts are independent, visible, non-overlapping and centered', () => {
  const p = placeFloaters(bounds, size);
  assert.equal(p.boutique.y, 776); assert.equal(p.restaurant.y, 776);
  assert.equal(p.restaurant.x - p.boutique.x, 182);
  assert.equal(overlaps({ ...p.boutique, ...size }, { ...p.restaurant, ...size }), false);
});
test('small screens stack controls without going outside safe bounds', () => {
  const b = { left: 12, top: 12, right: 248, bottom: 464 }, s = { width: 236, height: 52 };
  const p = placeFloaters(b, s);
  assert.equal(p.restaurant.y - p.boutique.y, 64);
  for (const v of Object.values(p)) assert.ok(v.x >= b.left && v.y >= b.top && v.x + s.width <= b.right && v.y + s.height <= b.bottom);
});
test('dragging outside viewport clamps and normalization survives orientation', () => {
  assert.deepEqual(clampPoint({ x: -200, y: 9999 }, bounds, size), { x: 12, y: 776 });
  assert.deepEqual(normalizedPoint({ x: -200, y: 9999 }, bounds, size), { x: 0, y: 1 });
  const p = placeFloaters({ left: 12, top: 12, right: 788, bottom: 304 }, size, { boutique: { x: 1, y: 1 } });
  assert.equal(p.boutique.x, 618); assert.equal(p.boutique.y, 252);
});
test('top and bottom tracking plus primary actions remain unobscured', () => {
  const obstacles = [{ x: 0, y: 0, width: 390, height: 90 }, { x: 0, y: 730, width: 390, height: 114 }, { x: 16, y: 580, width: 358, height: 96 }];
  const p = placeFloaters(bounds, size, {}, obstacles);
  for (const v of Object.values(p)) { assert.ok(v); assert.equal(obstacles.some(r => overlaps({ ...v, ...size }, r)), false); }
});
test('no available safe space hides shortcuts instead of covering tracking', () => {
  assert.equal(findSafePoint({ x: 12, y: 12 }, bounds, size, [{ x: 0, y: 0, width: 400, height: 900 }]), null);
  assert.deepEqual(placeFloaters(bounds, size, {}, [{ x: 0, y: 0, width: 400, height: 900 }]), { boutique: null, restaurant: null });
});
test('many sizes and saved preferences always respect safe areas and each other', () => {
  for (const width of [280, 320, 360, 390, 412, 768, 1024]) for (const height of [300, 560, 850]) for (const x of [0, .5, 1]) {
    const b = { left: 20, top: 40, right: width - 20, bottom: height - 32 };
    const s = { width: Math.min(160, width - 40), height: 52 };
    const p = placeFloaters(b, s, { boutique: { x, y: .75 }, restaurant: { x, y: .75 } });
    for (const v of Object.values(p).filter(Boolean)) assert.ok(v.x >= b.left && v.y >= b.top && v.x + s.width <= b.right && v.y + s.height <= b.bottom);
    if (p.boutique && p.restaurant) assert.equal(overlaps({ ...p.boutique, ...s }, { ...p.restaurant, ...s }), false);
  }
});
test('client integration preserves metrics, active tracking and original shop routes', () => {
  const app = fs.readFileSync('src/pages/ClientExterneApp.jsx', 'utf8');
  assert.ok(app.includes('<SilgappLiveStats countryCode={clientProfil?.country_code} />'));
  for (const item of ['<LiveCounterBadge', '<GPSBadge', '<SuivreCourseCard', '<SuiviBarreFlottante', '<QuickOrderProPanel', '<QuickOrderPanel', '<PubliciteCarousel', '<SupportWhatsApp']) assert.ok(app.includes(item), item);
  assert.equal((app.match(/<VenusFloatingButton/g) || []).length, 1);
  assert.ok(app.includes('<VenusFloatingButton inline hidden={expressOpen} />'));
  for (const flag of ['expressOpen','showProfilModal','showMap','showMessages','showNotificationsPanel','showRecherche','showSuiviFullscreen','showMultiCourseSelector','showAcceptanceAnim','courseLivreId','courseANoter','courseAnnuleeRelance','courseDecisionClient']) {
    assert.ok(app.slice(app.indexOf('<ClientServiceFloaters')).split('/>')[0].includes(flag), flag);
  }
  for (const path of ['/client/boutiques', '/client/restaurants', '/client/course/recevoir', '/client/course/deplacement']) assert.ok(app.includes(path), path);
  assert.ok(app.includes('Recevoir un colis'));
});
test('floater component is local UI only and does not call backend or create courses', () => {
  const source = fs.readFileSync('src/components/client/ClientServiceFloaters.jsx', 'utf8');
  assert.doesNotMatch(source, /base44|fetch\(|functions\.invoke|entities\./);
  for (const behavior of ['onPointerCancel', 'onLostPointerCapture', 'aria-describedby', 'visualViewport', 'ResizeObserver', 'onNavigate(path)', 'onKeyDown']) assert.ok(source.includes(behavior));
  assert.ok(source.includes("path: '/client/boutiques'"));
  assert.ok(source.includes("path: '/client/restaurants'"));
});

