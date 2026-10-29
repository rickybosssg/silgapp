import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { guestApi, guestStorage } from '@/lib/guestOrderClient';

export default function GuestOrderEntry() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [resume, setResume] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => guestApi()('config').then(value => { if (active) setEnabled(value.enabled === true); }).catch(() => { if (active) setEnabled(false); });
    refresh();
    guestStorage().read().then(value => { if (active) setResume(!!value); }).catch(() => {});
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  if (!enabled && !resume) return null;
  return <button type="button" onClick={() => navigate('/commande-invitee')} className="min-h-[52px] w-full rounded-lg bg-red-600 px-4 py-3 text-base font-bold text-white hover:bg-red-700">
    {resume ? 'Reprendre ma commande sans compte' : 'Commander sans compte'}
  </button>;
}
