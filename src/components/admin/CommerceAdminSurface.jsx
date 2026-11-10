import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {commerceAdminScope,createCommerceAdmin} from '@/lib/commerceAdminMigration';
import {financeRecordedNumber} from '@/lib/commerceFinancePreview';

export default function CommerceAdminSurface(props) {
  // Background notifications must not mount the dedicated country-selection form.
  if(!props.context)return props.mode==='popup'?null:<AdminCountrySelection {...props} />;
  let scope;
  try {scope=commerceAdminScope(props.context);} catch {return <p role="alert">Administration commerce indisponible : session et pays doivent être sélectionnés explicitement. Aucun accès global déduit du profil.</p>;}
  if(props.type==='pharmacie')return <p role="alert">La pharmacie ne fait pas partie de ce parcours commerce sécurisé.</p>;
  return <AdminScopedView key={JSON.stringify([scope,props.mode,props.type,props.parentId])} {...props} scope={scope} />;
}
function AdminScopedView({scope,mode='catalogue',type='boutique',parentId,onClose=undefined}) {
  const controller=useMemo(()=>createCommerceAdmin({sdk:base44,context:scope}),[scope.sessionId,scope.countryCode]);
  const [selected,setSelected]=useState(mode==='detail'?parentId:null);
  const [popupTab,setPopupTab]=useState('new');
  const [offset,setOffset]=useState(0);
  const [noticeOpen,setNoticeOpen]=useState(false);
  const shownNotices=useRef(new Set());
  const [visible,setVisible]=useState(()=>typeof document==='undefined'||document.visibilityState==='visible');
  useEffect(()=>{if(typeof document==='undefined')return;const update=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  const listType=mode==='popup'?(popupTab==='restaurants'?'restaurant':'boutique'):type;
  const list=useQuery({queryKey:['admin-commerce-secure',scope.sessionId,scope.countryCode,mode,listType,parentId,offset,popupTab],enabled:mode!=='detail',queryFn:()=>mode==='products'?controller.products(type,parentId,offset):controller.list(listType,{offset,...(mode==='popup'?{newOnly:popupTab==='new',validation:popupTab==='new'?undefined:'en_attente'}:{})}),retry:false,refetchInterval:query=>mode==='popup'&&visible&&!query.state.error?30000:false,refetchIntervalInBackground:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  useEffect(()=>{if(mode!=='popup'||list.isError||!list.data)return;const ids=list.data.rows.map(row=>listType+':'+row.id);if(ids.some(id=>!shownNotices.current.has(id))){ids.forEach(id=>shownNotices.current.add(id));setNoticeOpen(true);}},[mode,list.data,list.isError,listType]);
  const [error,setError]=useState('');const [pending,setPending]=useState(false);
  async function mutate(request) {
    if(!globalThis.confirm('Confirmer cette modification pour cet établissement et ce pays ?'))return;
    setPending(true);setError('');
    try{await controller.mutate(request);await list.refetch();}
    catch(e){setError(e.message==='ADMIN_OUTCOME_UNCERTAIN'?'Résultat incertain. Ne relancez pas : une vérification serveur est nécessaire.':'Action refusée ou indisponible. Aucune réussite confirmée.');}
    finally{setPending(false);}
  }
  const panel=<section aria-label="Administration commerce sécurisée" className="p-4 space-y-4 border rounded-xl">
    <h2 className="font-bold">Administration commerce · {scope.countryCode}</h2>
    <p>Le serveur vérifie les droits pour chaque action. Sans autorisation serveur, ce parcours refuse l'accès.</p>
    <p>Création, édition générale et suppression d'établissement indisponibles ici. Aucun repli vers les accès directs.</p>
    {mode==='popup'&&<button type="button" onClick={()=>setNoticeOpen(false)}>Fermer les notifications</button>}{onClose&&<button type="button" onClick={onClose}>Fermer</button>}
    {mode==='popup'&&<><p>Notifications commerce uniquement. Les notifications pharmacies restent dans leur fenêtre historique.</p><nav>{[['new','Nouvelles boutiques'],['boutiques','Boutiques en attente'],['restaurants','Restaurants en attente']].map(([key,label])=><button type="button" className="p-2" key={key} onClick={()=>{setPopupTab(key);setOffset(0);setSelected(null);}}>{label}</button>)}</nav></>}
    {mode!=='detail'&&<button type="button" disabled={list.isFetching||pending} onClick={()=>list.refetch()}>Actualiser</button>}
    {error&&<p role="alert">{error}</p>}
    {mode!=='detail'&&list.isFetching&&<p role="status">Chargement.</p>}
    {mode!=='detail'&&list.isError&&<p role="alert">Accès refusé ou lecture indisponible. Ce résultat ne signifie pas une liste vide.</p>}
    {mode!=='detail'&&!list.isError&&!list.isFetching&&list.data&&<>
      {!list.data.rows.length&&<p>Aucune ligne dans cette page.</p>}
      <ul>{list.data.rows.map(row=><li className="border rounded-xl p-3 space-y-2" key={row.id}>
        <p>{row.nom || row.id} · {row.validation || 'Validation indisponible'}</p>
        {mode==='products'?<><p>Prix enregistré : {financeRecordedNumber(row.prix)}</p>{type==='boutique'?['valider','refuser'].map(action=><button type="button" disabled={pending} key={action} onClick={()=>mutate({type,id:parentId,productId:row.id,operation:'moderate',action,motif:action==='refuser'?'Refusé par administration':''})}>{action}</button>):<p>Modération des plats indisponible côté serveur.</p>}</>:<>
          <button type="button" onClick={()=>setSelected(row.id)}>Détail, commission et modération</button>
          {mode==='popup'&&popupTab==='new'&&<button type="button" disabled={pending} onClick={()=>mutate({type:'boutique',id:row.id,operation:'acknowledge'})}>Confirmer la lecture</button>}
        </>}
      </li>)}</ul>
      <p>Page consultée uniquement. Aucun total global déduit.</p>
      {list.data.hasMore&&<button type="button" disabled={pending} onClick={()=>setOffset(list.data.nextOffset)}>Page suivante</button>}
      {offset>0&&<button type="button" disabled={pending} onClick={()=>setOffset(0)}>Première page</button>}
    </>}
    {selected&&<AdminDetail key={listType+':'+selected} controller={controller} scope={scope} type={listType} id={selected} onChanged={()=>mode!=='detail'&&list.refetch()} />}
  </section>;
  if(mode!=='popup')return panel;
  return <><button type="button" onClick={()=>setNoticeOpen(true)}>Notifications commerces · {scope.countryCode}</button>{list.isError&&<p role="alert">Notifications commerces indisponibles ou accès refusé. Aucune absence déduite.</p>}{noticeOpen&&<div role="dialog" aria-modal="true" aria-label="Nouveaux partenaires commerce" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl max-h-[85vh] overflow-y-auto w-full max-w-xl">{panel}</div></div>}</>;
}
function AdminDetail({controller,scope,type,id,onChanged}) {
  const [commission,setCommission]=useState('');const [motif,setMotif]=useState('');const [error,setError]=useState('');const [pending,setPending]=useState(false);
  const detail=useQuery({queryKey:['admin-commerce-detail',scope.sessionId,scope.countryCode,type,id],queryFn:async()=>({record:await controller.detail(type,id),commission:await controller.commission(type,id)}),retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  async function act(operation,action) {
    if(!globalThis.confirm('Confirmer cette modification pour cet établissement et ce pays ?'))return;
    setPending(true);setError('');
    try {
      if(operation==='commission'&&!commission.trim())throw Error('INVALID_COMMISSION');
      await controller.mutate({type,id,operation,action,motif,commission:Number(commission)});
      await detail.refetch();onChanged();
    }catch(e){setError(e.message==='ADMIN_OUTCOME_UNCERTAIN'?'Résultat incertain. Ne relancez pas : vérification serveur nécessaire.':'Action refusée, valeur invalide ou accès indisponible.');}
    finally{setPending(false);}
  }
  if(detail.isFetching)return <p role="status">Chargement du détail.</p>;
  if(detail.isError||!detail.data)return <p role="alert">Détail refusé ou indisponible. Aucune action possible.</p>;
  return <section className="space-y-3 border p-3"><h3>{detail.data.record.nom} · {detail.data.record.validation}</h3>
    <p>Commission enregistrée (%) : {financeRecordedNumber(detail.data.commission)}</p>
    {error&&<p role="alert">{error}</p>}
    <label>Nouvelle commission (%)<input type="number" min="0" max="100" step="any" value={commission} disabled={pending} onChange={e=>setCommission(e.target.value)} /></label>
    <button type="button" disabled={pending} onClick={()=>act('commission')}>Enregistrer la commission</button>
    <label>Motif de modération<input value={motif} disabled={pending} onChange={e=>setMotif(e.target.value)} /></label>
    <div>{['valider','refuser','suspendre','reactiver'].map(action=><button type="button" disabled={pending} key={action} onClick={()=>act('moderate',action)}>{action}</button>)}</div>
    <p>Aucune suppression disponible. La commission absente n'est pas remplacée par zéro.</p>
    <AdminScopedView scope={scope} mode="products" type={type} parentId={id} />
  </section>;
}

function AdminCountrySelection(props) {
  const [user,setUser]=useState(null),[country,setCountry]=useState(''),[selected,setSelected]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let mounted=true;base44.auth.me().then(me=>{if(!mounted)return;if(me?.role!=='admin'||me.enterprise_id){setError('Session administrateur requise.');return;}setUser(me);}).catch(()=>{if(mounted)setError('Session indisponible.');});return()=>{mounted=false;};},[]);
  if(selected)return <CommerceAdminSurface {...props} context={selected} />;
  return <section className="p-4 space-y-3"><h2>Sélection du pays commerce</h2><p>Choisissez explicitement un pays. Le serveur vérifiera votre autorisation ; le profil ne confère aucun accès global.</p>{error&&<p role="alert">{error}</p>}<form onSubmit={event=>{event.preventDefault();try{setSelected(commerceAdminScope({sessionId:user?.id,countryCode:country.trim().toUpperCase()}));}catch{setError('Indiquez un code pays de deux lettres avec une session administrateur valide.');}}}><label>Code pays<input value={country} maxLength={2} placeholder="Code pays" onChange={event=>setCountry(event.target.value)} /></label><button type="submit" disabled={!user}>Consulter ce pays</button></form></section>;
}
