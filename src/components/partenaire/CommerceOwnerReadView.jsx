import {createOwnerOrderActions,browserOrderIntentStorage,ownerOrderActions} from '@/lib/commerceOwnerOrderActions';
import React, {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {createCommerceFinancePreview,financeRecordedNumber} from '@/lib/commerceFinancePreview';
import {ownerReadInvoke,readOwnerOrderPage} from '@/lib/commerceOwnerReadView';
import CommerceFinancePreview from './CommerceFinancePreview';

// Owner-scoped readers. Actions require durable intention and exact server read-back.
export function OwnerFinanceReadView({scope}) {
  const [state,setState]=useState(null);
  const [model,setModel]=useState(null);
  useEffect(()=>{
    const next=createCommerceFinancePreview({invoke:ownerReadInvoke(base44,scope),onChange:setState});
    next.setScope(scope);setModel(next);
    return ()=>next.dispose();
  },[scope.sessionId,scope.parentId,scope.type,scope.countryCode]);
  return <CommerceFinancePreview state={state} onLoad={(section,options)=>model?.load(section,options)} />;
}
export function OwnerOrdersReadView({scope}) {
  const queryClient=useQueryClient();
  const [controller,setController]=useState(null);
  useEffect(()=>{const api=createOwnerOrderActions({sdk:base44,scope,storage:browserOrderIntentStorage()});setController(api);return()=>api.dispose();},[scope.sessionId,scope.parentId,scope.type,scope.countryCode]);
  async function updated(){await Promise.all([queryClient.invalidateQueries({queryKey:['owner-orders-read',scope.sessionId,scope.type,scope.parentId,scope.countryCode]}),queryClient.invalidateQueries({queryKey:['commandes',scope.type,scope.parentId,'server-owner',scope.sessionId]})]);}
  const [offset,setOffset]=useState(0);
  const result=useQuery({queryKey:['owner-orders-read',scope.sessionId,scope.type,scope.parentId,scope.countryCode,offset],queryFn:()=>readOwnerOrderPage(base44,scope,offset),retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  return <section className="space-y-3 p-4" aria-label="Commandes sécurisées">
    <h2 className="font-bold">Commandes enregistrées</h2>
    <p>Actions confirmées par relecture serveur. La recherche de livreur et la livraison ne sont jamais déduites du seul changement de statut. Annulation et messagerie indisponibles ici.</p>
    <button type="button" disabled={result.isFetching} onClick={()=>result.refetch()}>Actualiser</button>
    {result.isFetching && <p role="status">Chargement.</p>}
    {result.isError && <p role="alert">Commandes indisponibles. Ce résultat ne signifie pas zéro commande.</p>}
    {!result.isError && !result.isFetching && result.data && <>
      {result.data.rows.length===0 && <p>Aucune ligne dans cette page.</p>}
      <ul>{result.data.rows.map(row=><OwnerOrderActionCard key={row.id} row={row} controller={controller} scope={scope} onUpdated={updated} />)}</ul>
      <p>{offset>0||result.data.hasMore?'Page partielle, aucun total déduit.':'Fin des pages consultées, sans photographie immuable.'}</p>
      {result.data.hasMore && <button type="button" onClick={()=>setOffset(result.data.nextOffset)}>Page suivante</button>}
    </>}
    {offset>0 && <button type="button" disabled={result.isFetching} onClick={()=>setOffset(0)}>Première page</button>}
  </section>;
}

const actionLabels={verifier_paiement:'Mettre le paiement en vérification',valider_paiement:'Valider le paiement',refuser_paiement:'Refuser le paiement',commencer_preparation:'Commencer la préparation',prete_recuperation:'Déclarer la commande prête'};
function OwnerOrderActionCard({row,controller,scope,onUpdated}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[proof,setProof]=useState(null),[loaded,setLoaded]=useState(false),[consulted,setConsulted]=useState(false),[prep,setPrep]=useState('');
  const pending=useRef(false),generation=useRef(0);
  useEffect(()=>()=>{generation.current++;controller?.clearProof(row.id);},[controller,row.id]);
  useEffect(()=>{if(!proof)return;const timer=setTimeout(()=>{controller?.clearProof(row.id);setProof(null);setLoaded(false);setConsulted(false);},Math.max(0,proof.expiresAt-Date.now()));return()=>clearTimeout(timer);},[proof,controller,row.id]);
  let entry,storageError=false;try{entry=controller?.intent(row.id);}catch{storageError=true;}
  const unresolved=entry&&['pending','uncertain'].includes(entry.phase);
  const available=ownerOrderActions(row,{proofConsulted:consulted&&controller?.consulted(row.id)});
  let items=null;try{const parsed=JSON.parse(row.items||'null');if(Array.isArray(parsed))items=parsed;}catch{/* Reader normally rejects malformed stored items. */}
  async function act(action) {
    if(pending.current||!controller||storageError||unresolved)return;
    if(!globalThis.confirm(actionLabels[action]+' ? Cette action peut notifier le client ou créer une livraison.'))return;
    pending.current=true;setBusy(true);setError('');setNotice('');const epoch=generation.current;
    try {await controller.perform({id:row.id,action,preparationTime:Number(prep)});if(epoch!==generation.current)return;setProof(null);setConsulted(false);setNotice('Statut relu et confirmé. Aucun départ de livreur confirmé par ce résultat.');await onUpdated();}
    catch(e){if(epoch===generation.current)setError(e.message==='ORDER_OUTCOME_UNCERTAIN'||e.message==='ORDER_RECONCILIATION_REQUIRED'?'Résultat incertain : ne relancez pas. Vérifiez uniquement l’état enregistré.':'Action refusée ou indisponible. Aucun succès confirmé.');}
    finally{pending.current=false;if(epoch===generation.current)setBusy(false);}
  }
  async function reconcile() {
    if(pending.current||!controller)return;pending.current=true;setBusy(true);setError('');const epoch=generation.current;
    try{const result=await controller.reconcile(row.id);if(epoch!==generation.current)return;setNotice(result.confirmed?'État de commande relu. Aucun dispatch confirmé.':'État relu, résultat de l’action toujours incertain. Une vérification serveur est nécessaire.');await onUpdated();}
    catch{if(epoch===generation.current)setError('Relecture indisponible. Aucune action renvoyée.');}
    finally{pending.current=false;if(epoch===generation.current)setBusy(false);}
  }
  async function openProof(){
    if(pending.current||!controller)return;pending.current=true;setBusy(true);setError('');const epoch=generation.current;
    controller.clearProof(row.id);setProof(null);setConsulted(false);setLoaded(false);
    try{const value=await controller.proof(row.id);if(epoch!==generation.current){controller.clearProof(row.id);return;}setProof(value);}
    catch{if(epoch===generation.current)setError('Justificatif privé indisponible. Validation et refus de paiement restent bloqués.');}
    finally{pending.current=false;if(epoch===generation.current)setBusy(false);}
  }
  function closeProof(){controller?.clearProof(row.id);setProof(null);setLoaded(false);setConsulted(false);}
  return <li className="border p-3 rounded-xl space-y-3">
    <p>#{row.id} · {row.statut || 'Statut indisponible'}</p>
    <p>{row.client_nom || 'Client'}{row.client_telephone ? ' · '+row.client_telephone : ''}</p>
    {items?<ul>{items.map((item,index)=><li key={index}>{item.nom || 'Article'} · Quantité : {financeRecordedNumber(item.quantite)} · Prix unitaire : {financeRecordedNumber(item.prix)}</li>)}</ul>:<p>Détail des articles indisponible.</p>}
    {row.note_client&&<p>Note du client : {row.note_client}</p>}
    <p>Montant enregistré : {financeRecordedNumber(row.total)} · Devise non attestée</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {storageError&&<p role="alert">Stockage de l’intention indisponible. Actions bloquées.</p>}
    {unresolved&&<><p role="alert">Une action précédente reste à vérifier. Aucun nouvel envoi automatique.</p><button type="button" disabled={busy} onClick={reconcile}>Vérifier uniquement l’état enregistré</button></>}
    {row.has_private_payment_proof===true?<button type="button" disabled={busy||!controller} onClick={openProof}>Consulter le justificatif privé</button>:<p>{row.has_payment_proof?'Justificatif historique non privé : consultation sécurisée indisponible.':'Présence de justificatif privé non attestée.'}</p>}
    {proof&&<section aria-label="Justificatif privé temporaire"><p>Accès temporaire, valable au maximum 60 secondes.</p><img src={proof.url} alt="Justificatif de cette commande" referrerPolicy="no-referrer" className="max-h-72 object-contain" onLoad={()=>{controller.proofLoaded(row.id,proof.token);setLoaded(true);}} onError={()=>{closeProof();setError('Justificatif illisible. Validation bloquée.');}} /><button type="button" disabled={!loaded||busy} onClick={()=>{try{controller.acknowledgeProof(row.id,proof.token);setConsulted(true);}catch{closeProof();setError('Justificatif expiré.');}}}>J’ai consulté le justificatif de cette commande</button><button type="button" onClick={closeProof}>Fermer le justificatif</button></section>}
    {row.statut==='paiement_verification'&&!consulted&&<p>Validation et refus bloqués tant que le justificatif privé n’a pas été consulté.</p>}
    {scope.type==='restaurant'&&row.statut==='paiement_valide'&&<label>Temps de préparation<select value={prep} disabled={busy} onChange={e=>setPrep(e.target.value)}><option value="">Choisir</option>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>}
    <div>{available.map(action=><button type="button" key={action} disabled={busy||!controller||storageError||!!unresolved||(action==='commencer_preparation'&&scope.type==='restaurant'&&!prep)} onClick={()=>act(action)}>{actionLabels[action]}</button>)}</div>
    {row.course_id&&<p>Course liée enregistrée. Affectation, dispatch et livraison non confirmés par cette vue.</p>}
    <p>Annulation indisponible. Aucune relance automatique après résultat incertain.</p>
  </li>;
}
