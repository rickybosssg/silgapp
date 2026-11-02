import { useEffect, useRef, useState } from 'react';
import { clientEventSnapshot, nextClientEvent } from '@/lib/clientCourseEvents';
import { playClientCourseAudio, stopClientCourseAudio } from '@/lib/clientCourseAudio';

export function useClientCourseEvents(course) {
  const mountedAt = useRef(Date.now()), memory = useRef(new Map());
  const [event, setEvent] = useState(null);
  useEffect(() => {
    const next = clientEventSnapshot(course); if (!next?.key) return;
    const key = 'silgapp_client_event_v1:' + next.key;
    let previous = memory.current.get(key), restored = false;
    if (!previous) { try { previous = JSON.parse(localStorage.getItem(key)); restored = true; } catch { /* Baseline only if unreadable. */ } }
    if (previous?.updated && next.updated && Date.parse(next.updated) < Date.parse(previous.updated)) return;
    let kind = nextClientEvent(previous, next);
    // A first visit/reopen establishes a baseline; only a creation in this mount is new.
    if (restored) kind = null;
    if (!previous && next.state === 'search' && Date.parse(course.created_date || course.created_at) >= mountedAt.current) kind = 'search';
    memory.current.set(key, next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* In-memory de-duplication remains active. */ }
    if (kind) { setEvent({ kind, key: JSON.stringify(next) }); void playClientCourseAudio(kind); }
  }, [course]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== 'visible') stopClientCourseAudio(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stopClientCourseAudio(); };
  }, []);
  return event;
}
