import { useEffect, useId, useRef, useState } from 'react';
import { Store, UtensilsCrossed } from 'lucide-react';
import { SERVICE_IDS, FLOATING_STORAGE_KEY, DRAG_THRESHOLD, readFloatingPreferences, normalizedPoint, placeFloaters } from '@/lib/clientServiceFloaters';
import './ClientServiceFloaters.css';

const ITEMS = [{ id: 'boutique', label: 'Boutique', path: '/client/boutiques', Icon: Store },
  { id: 'restaurant', label: 'Restaurant', path: '/client/restaurants', Icon: UtensilsCrossed }];
const EDITABLE = 'input,textarea,select,[contenteditable="true"],[role="textbox"]';
const PROTECTED = '[data-client-floating-protected], [data-testid="commander-card"], [data-testid="suivre-course-card"], [data-testid="refaire-card"]';
function rectOf(element) {
  const r = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  // Reserve the final position of a bottom-fixed tracking bar even during its
  // translateY entrance animation. Its size alone does not trigger resize.
  const bottom = style.position === 'fixed' ? parseFloat(style.bottom) : NaN;
  const settledTop = Number.isFinite(bottom) ? window.innerHeight - bottom - element.offsetHeight : r.top;
  const top = Math.min(r.top, settledTop);
  return { x: r.left, y: top, width: r.width, height: Math.max(r.bottom, settledTop + element.offsetHeight) - top };
}
function shown(element) {
  const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

/** Two local UI shortcuts; never creates a course or calls a backend. */
export default function ClientServiceFloaters({ hidden = false, onNavigate }) {
  const instructionsId = useId();
  const safeProbe = useRef(null);
  const buttons = useRef({});
  const preferences = useRef(null);
  if (preferences.current === null) {
    try { preferences.current = readFloatingPreferences(localStorage.getItem(FLOATING_STORAGE_KEY)); }
    catch { preferences.current = {}; }
  }
  const gesture = useRef(null);
  const suppressClick = useRef({});
  const measureRef = useRef(() => {});
  const layoutRef = useRef(null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const [layout, setLayout] = useState(null);
  const [blocked, setBlocked] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [moving, setMoving] = useState(null);

  function save() {
    try { localStorage.setItem(FLOATING_STORAGE_KEY, JSON.stringify(preferences.current)); } catch { /* Private mode: usable without persistence. */ }
  }
  function cancelGesture() {
    const g = gesture.current;
    if (!g) return;
    suppressClick.current[g.id] = { until: Date.now() + 800, cancelled: true };
    preferences.current = g.before;
    gesture.current = null;
    setMoving(null);
    measureRef.current();
  }

  useEffect(() => {
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); }); };
    function measure() {
      const vv = window.visualViewport;
      const viewport = { left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0,
        width: vv?.width || window.innerWidth, height: vv?.height || window.innerHeight };
      const editable = document.activeElement?.matches?.(EDITABLE);
      const keyboard = !!vv && vv.scale <= 1.05 && window.innerHeight - vv.height > 140;
      // Full-screen views and dialogs can originate inside Venus or advertising.
      // They need not know about these shortcuts; they always take precedence.
      const overlay = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],.fixed.inset-0'))
        .some(element => shown(element) && !element.closest('[data-client-service-floaters]'));
      const unavailable = hiddenRef.current || editable || keyboard || overlay;
      setBlocked(!!unavailable);
      if (unavailable && gesture.current) {
        suppressClick.current[gesture.current.id] = { until: Date.now() + 800, cancelled: true };
        preferences.current = gesture.current.before;
        gesture.current = null;
        setMoving(null);
      }
      const style = safeProbe.current ? getComputedStyle(safeProbe.current) : null;
      const px = property => parseFloat(style?.getPropertyValue(property) || '0') || 0;
      const bounds = { left: viewport.left + 12 + px('padding-left'), top: viewport.top + 12 + px('padding-top'),
        right: viewport.left + viewport.width - 12 - px('padding-right'),
        bottom: viewport.top + viewport.height - 16 - px('padding-bottom') };
      const availableWidth = Math.max(0, bounds.right - bounds.left);
      const width = Math.min(170, availableWidth < 270 ? availableWidth : (availableWidth - 12) / 2);
      const height = Math.max(52, ...SERVICE_IDS.map(id => buttons.current[id]?.getBoundingClientRect().height || 52));
      const size = { width, height };
      const obstacles = Array.from(document.querySelectorAll(PROTECTED)).flatMap(element => {
        const elements = element.hasAttribute('data-client-floating-protected') && element.getBoundingClientRect().height === 0
          ? Array.from(element.children) : [element];
        return elements.filter(shown).map(rectOf).filter(r => r.x < bounds.right && r.x + r.width > bounds.left && r.y < bounds.bottom && r.y + r.height > bounds.top);
      });
      const priority = gesture.current?.id === 'boutique' ? 'restaurant' : 'boutique';
      const positions = placeFloaters(bounds, size, preferences.current, obstacles, priority);
      const next = { bounds, size, positions };
      layoutRef.current = next;
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    measureRef.current = measure;
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (document.querySelector('[data-client-service-content]')) resize.observe(document.querySelector('[data-client-service-content]'));
    for (const element of Object.values(buttons.current)) if (element) resize.observe(element);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('blur', cancelGesture);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    vvListen('addEventListener');
    function vvListen(method) {
      window.visualViewport?.[method]('resize', schedule);
      window.visualViewport?.[method]('scroll', schedule);
    }
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutation.disconnect(); resize.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('blur', cancelGesture);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      vvListen('removeEventListener');
      measureRef.current = () => {};
    };
  }, []);
  useEffect(() => { measureRef.current(); }, [hidden]);

  function begin(event, id) {
    if (!event.isPrimary || event.button !== 0 || blocked || hidden || !layoutRef.current?.positions[id]) return;
    suppressClick.current[id] = null;
    gesture.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      origin: { ...layoutRef.current.positions[id] }, before: { ...preferences.current }, dragged: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event, id) {
    const g = gesture.current;
    if (!g || g.id !== id || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.dragged = true;
    setMoving(id);
    event.preventDefault();
    const current = layoutRef.current;
    preferences.current = { ...preferences.current, [id]: normalizedPoint({ x: g.origin.x + dx, y: g.origin.y + dy }, current.bounds, current.size) };
    measureRef.current();
  }
  function end(event, id) {
    const g = gesture.current;
    if (!g || g.id !== id || g.pointerId !== event.pointerId) return;
    if (g.dragged) {
      suppressClick.current[id] = { until: Date.now() + 800 };
      const current = layoutRef.current, point = current?.positions[id];
      if (point) preferences.current = { ...preferences.current, [id]: normalizedPoint(point, current.bounds, current.size) };
      save();
      setAnnouncement((id === 'boutique' ? 'Boutique' : 'Restaurant') + ' déplacé.');
    }
    gesture.current = null;
    setMoving(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    measureRef.current();
  }
  function keyboard(event, id) {
    const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
    if (event.key !== 'Home' && !(event.altKey && delta)) return;
    event.preventDefault();
    const current = layoutRef.current;
    if (!current?.positions[id]) return;
    if (event.key === 'Home') {
      const next = { ...preferences.current }; delete next[id]; preferences.current = next;
    } else {
      const point = current.positions[id];
      preferences.current = { ...preferences.current, [id]: normalizedPoint({ x: point.x + delta[0], y: point.y + delta[1] }, current.bounds, current.size) };
    }
    save(); measureRef.current();
    setAnnouncement(event.key === 'Home' ? 'Position réinitialisée.' : 'Bouton déplacé.');
  }
  const invisible = hidden || blocked;
  return <div data-client-service-floaters>
    <div ref={safeProbe} className="client-floater-safe-insets" aria-hidden="true" />
    <p id={instructionsId} className="client-floater-instructions">Touchez pour ouvrir. Faites glisser pour déplacer. Au clavier : Entrée pour ouvrir, Alt et flèches pour déplacer, Origine pour réinitialiser.</p>
    <span className="client-floater-instructions" role="status" aria-live="polite">{announcement}</span>
    {ITEMS.map(({ id, label, path, Icon }) => {
      const point = layout?.positions[id];
      const concealed = invisible || !point;
      return <button key={id} ref={node => { buttons.current[id] = node; }}
        type="button" className="client-service-floater" data-service={id} data-dragging={moving === id}
        aria-label={label} aria-describedby={instructionsId} aria-hidden={concealed} tabIndex={concealed ? -1 : 0}
        style={{ left: point?.x || 0, top: point?.y || 0, width: layout?.size.width || 140,
          fontSize: (layout?.size.width || 140) < 140 ? 12 : 14, visibility: concealed ? 'hidden' : 'visible', pointerEvents: concealed ? 'none' : 'auto' }}
        onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()}
        onTouchEnd={event => event.stopPropagation()} onTouchCancel={event => event.stopPropagation()}
        onPointerDown={event => begin(event, id)} onPointerMove={event => move(event, id)}
        onPointerUp={event => end(event, id)} onPointerCancel={cancelGesture}
        onLostPointerCapture={() => { if (gesture.current?.id === id) cancelGesture(); }}
        onKeyDown={event => keyboard(event, id)}
        onClick={event => {
          if (concealed || gesture.current?.dragged || (event.detail !== 0 && Date.now() < (suppressClick.current[id]?.until || 0))) {
            event.preventDefault(); event.stopPropagation(); return;
          }
          onNavigate(path);
        }}>
        <Icon size={22} aria-hidden="true" /><span>{label}</span>
      </button>;
    })}
  </div>;
}




