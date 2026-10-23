import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useQueryClient} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
import {createDriverWithdrawalRequest} from '@/lib/driverWithdrawalClient';
import {DRIVER_PRE_PICKUP_STATUSES,DRIVER_WITHDRAWAL_REASONS,driverHasCustody} from '../../../base44/shared/driverWithdrawalPolicy.js';

export default function DriverWithdrawalDialog({open,course,onClose,onWithdrawn=undefined,api=base44}) {
  const queryClient=useQueryClient();
  const [motif,setMotif]=useState('');
  const [detail,setDetail]=useState('');
  const [pending,setPending]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const request=useRef(null),generation=useRef(0),viewGeneration=useRef(0),lock=useRef(false);
  const custody=driverHasCustody(course);
  const eligible=!!course?.livreur_id && DRIVER_PRE_PICKUP_STATUSES.includes(course?.statut) && !custody;
  useEffect(()=>{viewGeneration.current++;return()=>{viewGeneration.current++;};},[open,course?.id,api]);
  useEffect(()=>{
    const token=++generation.current;
    if(!open)return undefined;
    setReady(false);setError('');setPending(false);lock.current=false;
    if(eligible)api.functions.invoke('annulerCourseExterne',{action:'withdrawal_capability'}).then(response=>{
      if(token!==generation.current)return;
      const body=response?.data??response;
      if(body?.success===true&&body?.withdrawal_contract==='per-course-v1')setReady(true);
      else setError('Le serveur ne confirme pas encore le retrait sécurisé. Aucune course ne sera modifiée.');
    }).catch(()=>{if(token===generation.current)setError('Impossible de vérifier le serveur. Fermez puis réessayez. Aucune course modifiée.');});
    return()=>{generation.current++;};
  },[open,course?.id,course?.heure_acceptation,eligible,api]);
  useEffect(()=>{request.current=null;setMotif('');setDetail('');},[course?.id,course?.heure_acceptation]);
  const withdraw=async()=>{
    if(lock.current||!ready||!eligible||!motif||motif==='autre'&&!detail.trim())return;
    lock.current=true;setPending(true);setError('');const token=viewGeneration.current;
    try{
      if(!request.current)request.current=createDriverWithdrawalRequest(api);
      const result=await request.current({courseId:course.id,driverId:course.livreur_id,acceptedAt:course.heure_acceptation||course.accepted_at||'',motif,detail:detail.trim()});
      if(!result)return;
      for(const key of ['mes-courses-externes','livreur-externe-profil','eco-mission-active','eco-mission-active-courses'])queryClient.invalidateQueries({queryKey:[key]});
      if(token!==viewGeneration.current)return;
      if(result.status_sync_pending)toast.warning('Retrait confirmé. Le statut livreur est en cours de synchronisation.');
      else toast.success('Retrait confirmé. Le client choisira la suite ; vos autres courses restent actives.');
      onWithdrawn?.({courseId:course.id,motif,detail:detail.trim(),result});onClose();
    }catch(e){if(token===viewGeneration.current)setError(e?.response?.data?.error||e.message||'Retrait non confirmé. Réessayez sans changer de course.');}
    finally{if(token===viewGeneration.current){lock.current=false;setPending(false);}}
  };
  if(!open||!course)return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 sm:items-center"><section role="dialog" aria-modal="true" aria-label="Se retirer de cette course" className="flex max-h-[88dvh] w-full max-w-sm flex-col rounded-lg bg-white text-slate-900 shadow-xl">
    <header className="shrink-0 border-b p-4"><h2 className="text-lg font-bold">Se retirer de cette course</h2><p className="mt-2 break-words text-sm font-semibold">#{course.reference || course.id.slice(-8)} : {course.quartier_depart || course.adresse_depart} → {course.quartier_arrivee || course.adresse_arrivee}</p></header>
    <div className="min-h-0 space-y-3 overflow-y-auto p-4">
      {eligible?<><p className="text-sm">Seule cette course vous sera retirée. Le client choisira de chercher un autre livreur ou d’annuler. Vos autres courses ne changent pas.</p><label className="block text-sm font-semibold">Motif<select className="mt-1 h-12 w-full rounded-lg border bg-white px-3 text-slate-900" value={motif} disabled={pending} onChange={e=>setMotif(e.target.value)}><option value="">Choisir un motif</option>{Object.entries(DRIVER_WITHDRAWAL_REASONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="block text-sm font-semibold">Précisions {motif==='autre'?'(obligatoires)':'(facultatives)'}<textarea rows={3} className="mt-1 w-full resize-none rounded-lg border p-3 text-base" value={detail} disabled={pending} onChange={e=>setDetail(e.target.value)} /></label></>:<p role="alert" className="text-sm text-amber-900">{custody?'Le colis ou passager est déjà pris en charge. Contactez un administrateur pour traiter l’incident. La course reste sous votre responsabilité.':'Cette course ne permet pas de retrait. Actualisez la liste.'}</p>}
      {error&&<p role="alert" className="break-words text-sm text-red-700">{error}</p>}
    </div>
    <footer className="grid shrink-0 grid-cols-1 gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{eligible&&<button type="button" className="min-h-12 rounded-lg bg-red-600 px-3 py-3 font-semibold text-white disabled:opacity-50" disabled={!ready||pending||!motif||motif==='autre'&&!detail.trim()} onClick={withdraw}>{pending?'Retrait en cours…':'Confirmer mon retrait'}</button>}<button type="button" className="min-h-12 rounded-lg border px-3 py-3 font-semibold disabled:opacity-50" disabled={pending} onClick={onClose}>Retour</button></footer>
  </section></div>,document.body);
}
