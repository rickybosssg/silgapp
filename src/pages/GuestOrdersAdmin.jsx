import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Eye, ShieldX } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { guestApi } from '@/lib/guestOrderClient';
import { useAdminContext } from '@/hooks/useAdminContext';
import CourseDetailDialog from '@/components/courses/CourseDetailDialog';
import { getCourseStatusLabel } from '@/lib/courseStatuses';

/** @param {any} props */
export default function GuestOrdersAdmin({ call: suppliedCall } = {}) {
  const { user, loading, selectedCountry } = useAdminContext();
  const call = useRef(suppliedCall || guestApi()).current;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statut, setStatut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);
  const [preview, setPreview] = useState(false);
  const lock = useRef(false);
  const detailGeneration = useRef(0);
  useEffect(() => { detailGeneration.current++; setDetails(null); return () => { detailGeneration.current++; }; }, [user?.id, selectedCountry]);
  const admin = !!user?.id && user.role === 'admin' && !user.enterprise_id && !user.data?.enterprise_id && user.silgapp_role !== 'admin_entreprise';
  const superAdmin = admin && (user.admin_type === 'global' || (!user.admin_type && !user.country_code)) && (!user.silgapp_role || ['super_admin', 'superadmin'].includes(user.silgapp_role));
  const query = useQuery({
    queryKey: ['guest-orders-admin', user?.id, selectedCountry, from, to, statut],
    queryFn: () => call('admin_list', { country_code: selectedCountry || '', from: from ? from + 'T00:00:00.000Z' : '', to: to ? to + 'T23:59:59.999Z' : '', statut }),
    enabled: admin, staleTime: 60000, retry: false, refetchOnWindowFocus: false,
  });
  async function toggle() {
    if (lock.current || !query.data || !superAdmin || !window.confirm(query.data.enabled ? 'Désactiver les nouvelles commandes sans compte ? Le suivi existant restera accessible.' : 'Autoriser les nouvelles commandes sans compte ?')) return;
    lock.current = true; setBusy(true); setError('');
    try { await call('set_enabled', { enabled: !query.data.enabled }); await query.refetch(); }
    catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function openCourse(row) {
    if (!row.course_id || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const token = detailGeneration.current;
    try {
      // Normal authenticated entity permissions still apply; no new detail endpoint bypass.
      const course = await base44.entities.CourseExterne.get(row.course_id);
      if (course.country_code !== row.country_code || course.enterprise_id || course.request_id !== 'guest-v1:' + row.request_id) throw Error('La course ne correspond plus au périmètre autorisé.');
      if (token === detailGeneration.current) setDetails(course);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function revoke(row) {
    if (lock.current || !window.confirm('Révoquer l’accès privé à cette commande ? La course restera intacte.')) return;
    lock.current = true; setBusy(true); setError('');
    try { await call('revoke', { request_id: row.request_id, country_code: row.country_code }); await query.refetch(); }
    catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (loading) return <p role="status" className="p-4">Chargement des droits…</p>;
  if (!admin) return <p role="alert" className="p-4">Accès administrateur public requis.</p>;
  const data = query.data;
  const field = 'w-full min-w-0 rounded-lg border border-gray-300 bg-white p-2 text-gray-950';
  return <main className="min-w-0 space-y-5 bg-white p-4 pb-24 text-gray-950">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">Commandes sans compte</h1><button type="button" title="Actualiser" aria-label="Actualiser" disabled={query.isFetching || busy} onClick={() => query.refetch()} className="rounded-lg border p-2"><RefreshCw className="h-5 w-5" /></button></header>
    {superAdmin && <label className="flex items-center justify-between gap-3 border-y py-4 text-sm font-semibold">Autoriser les commandes sans compte<input type="checkbox" role="switch" checked={data?.enabled === true} disabled={!data || busy || query.isError || data.configuration_unavailable} onChange={toggle} className="h-5 w-5" /></label>}
    {data?.configuration_unavailable && <p role="alert" className="text-sm text-red-800">Réglage indisponible. Le suivi des commandes existantes reste indépendant.</p>}
    {data && !data.safety_reviewed && <p role="status" className="text-sm text-amber-800">Activation bloquée : contrôles de confidentialité et de mise en service non validés.</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-sm">Du (UTC)<input className={field} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-sm">Au (UTC)<input className={field} type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label className="text-sm">Statut<select className={field} value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous</option>{['nouvelle', 'recherche_livreur', 'livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].map(s => <option key={s} value={s}>{getCourseStatusLabel(s)}</option>)}</select></label></div>
    <p className="text-sm text-gray-600">Pays : {selectedCountry || 'Tous les pays autorisés'}</p>
    {(query.isError || error) && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error || query.error?.message || 'Lecture indisponible.'}{query.isError && data ? ' Dernières données connues, non actualisées.' : ''}</p>}
    {query.isLoading && <p role="status">Chargement des commandes…</p>}
    {data && <>
      <p className="text-xs text-gray-500">Lecture : {new Date(data.as_of).toLocaleString('fr-FR')}{data.partial ? ' — données partielles, vérification nécessaire' : ''}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y py-4 sm:grid-cols-3">{[['Créées', data.counts.created], ['En cours', data.counts.in_progress], ['Livrées', data.counts.delivered], ['Annulées', data.counts.cancelled], ['Numéros déclarés distincts', data.counts.distinct_declared_numbers], ['Inscriptions attribuées', data.counts.registrations]].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-600">{label}</dt><dd className="text-lg font-semibold">{value == null ? 'Non disponible' : value}</dd></div>)}</dl>
      <section aria-label="Courses invitées" className="divide-y">{!data.rows.length && <p className="py-4 text-sm">Aucune commande pour ces filtres.</p>}{data.rows.map(row => <article key={row.request_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-words font-semibold">{row.reference || 'Référence indisponible'}</p><p>{row.country_code} · {row.phone} · {row.statut ? getCourseStatusLabel(row.statut) : 'État non confirmé'}</p><p>{row.montant ?? '—'} {row.devise} · {new Date(row.date).toLocaleString('fr-FR')}</p>{row.revoked && <p>Accès privé révoqué</p>}</div><div className="flex gap-2"><button title="Détail de la course" aria-label="Détail de la course" type="button" disabled={!row.course_id || busy} className="rounded-lg border p-2" onClick={() => openCourse(row)}><Eye className="h-5 w-5" /></button><button type="button" title="Révoquer l’accès privé" aria-label="Révoquer l’accès privé" disabled={row.revoked || busy} className="rounded-lg border p-2 text-red-700" onClick={() => revoke(row)}><ShieldX className="h-5 w-5" /></button></div></article>)}</section>
      <section className="border-t pt-4"><h2 className="text-base font-semibold">Contacts déclarés, non vérifiés</h2>{data.contacts.map(c => <div key={c.country_code + c.phone} className="border-b py-3 text-sm"><p>{c.country_code} · {c.phone} · {c.courses.length} course(s)</p><p>{c.invitation.opposed ? 'Opposition enregistrée' : c.invitation.consent ? 'Accord pour invitation enregistré' : 'Aucun accord promotionnel'} · Dernière relance : {c.invitation.last_invitation_at || 'Aucune'}</p><p>Envoi : Non disponible</p></div>)}</section>
      <button type="button" className="text-sm text-blue-700 underline" onClick={() => setPreview(v => !v)}>Prévisualiser l’invitation</button>{preview && <p className="rounded-lg border p-3 text-sm">{data.invitation_preview}</p>}
    </>}
    {details && <CourseDetailDialog course={details} open onClose={() => { setDetails(null); query.refetch(); }} reseau="externe" />}
  </main>;
}
