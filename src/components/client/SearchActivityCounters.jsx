import React, { useEffect, useRef, useState } from 'react';
import { Eye, Ban } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { searchAttempt } from '../../../base44/shared/courseSearchActivity.js';
import { withRequestDeadline } from '@/lib/guestTrackingState';

export default function SearchActivityCounters({ course }) {
  const [value, setValue] = useState(null), [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const attempt = searchAttempt(course);
  useEffect(() => {
    const token = ++generation.current;
    setValue(null); setUnavailable(false);
    if (course.private_guest) return;
    let timer, busy = false;
    async function read() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      let delay = 15000;
      try {
        const raw = await withRequestDeadline(base44.functions.invoke('courseSearchActivity', { action: 'read', course_id: course.id }), 15000, 'Mesures indisponibles.');
        const result = raw?.data ?? raw;
        if (result?.success !== true || result.activity?.attempt !== attempt) throw Error('Unavailable');
        if (generation.current === token) { setValue(result.activity); setUnavailable(false); }
      } catch (e) {
        delay = Math.max(30000, Number(e?.response?.headers?.['retry-after'] || 0) * 1000);
        if (generation.current === token) setUnavailable(true);
      } finally { busy = false; if (generation.current === token) timer = setTimeout(read, delay); }
    }
    const resume = () => { clearTimeout(timer); void read(); };
    void read(); document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume);
    return () => { generation.current++; clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [course.id, course.private_guest, attempt]);
  const data = course.private_guest ? course.search_activity : value;
  const count = key => Number.isSafeInteger(data?.[key]) && data[key] >= 0 ? data[key] : '—';
  return <section aria-label="Consultations et refus" className="mb-4 space-y-2">
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3"><Eye className="text-blue-600" size={22} /><strong className="block text-2xl text-blue-800">{count('views')}</strong><span className="text-sm">Ont vu la course</span></div>
      <div className="rounded-lg border border-red-100 bg-red-50 p-3"><Ban className="text-red-600" size={22} /><strong className="block text-2xl text-red-800">{count('refusals')}</strong><span className="text-sm">Ont refusé</span></div>
    </div>
    <p className="text-xs text-gray-600">{!data ? 'Mesures indisponibles.' : 'Mesures partielles : versions compatibles et propositions autorisées uniquement.'}{unavailable && data ? ' Dernières données connues, actualisation indisponible.' : ''}</p>
  </section>;
}
