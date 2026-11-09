import React from 'react';
import { financeRecordedNumber } from '../../lib/commerceFinancePreview.js';

// Dormant controlled qualification view: never invokes the backend by itself.
// Its host owns a scoped createCommerceFinancePreview model and explicit load calls.
export default function CommerceFinancePreview({state,onLoad}) {
  if (!state?.scope) return <section aria-label="Qualification financière"><p>Sélectionnez un établissement et une session vérifiés.</p></section>;
  const labels={facts:'Données enregistrées',orders:'Commandes et commissions enregistrées',payments:'Paiements enregistrés'};
  return <section aria-label="Qualification financière" className="space-y-4 rounded-xl border p-4">
    <h2 className="font-bold">Prévisualisation financière de qualification</h2>
    <p role="note">Lecture seule. Aucun solde à payer calculé. Devise non attestée : montants affichés sans conversion.</p>
    <p>{state.scope.type} · {state.scope.parentId} · {state.scope.countryCode}</p>
    {Object.entries(labels).map(([key,label])=>{
      const section=state.sections[key];
      const facts=key==='facts'?section.rows[0]:null;
      return <section key={key} aria-label={label} className="space-y-2 border-t pt-3">
        <h3 className="font-semibold">{label}</h3>
        <button type="button" disabled={section.status==='loading'} onClick={()=>onLoad(key)}>
          {section.status==='idle'?'Charger':'Actualiser'}
        </button>
        {section.status==='loading' && <p role="status">Chargement…</p>}
        {section.status==='error' && <p role="alert">Lecture indisponible ou périmètre modifié. Actualisez ce volet. Aucun total fiable ne peut être déduit.</p>}
        {section.status==='ready' && <>
          {facts && <dl>
            <dt>Commission configurée enregistrée (%)</dt><dd>{financeRecordedNumber(facts.commission_pct)}</dd>
            <dt>Montant dû stocké, non rapproché et non payable depuis cette vue</dt><dd>{financeRecordedNumber(facts.montant_du_silga)}</dd>
            <dt>Visites enregistrées</dt><dd>{financeRecordedNumber(facts.nb_visites)}</dd>
          </dl>}
          {key!=='facts' && <ul className="space-y-2">
            {section.rows.map(row=><li key={row.id} className="rounded border p-2">
              <p>{row.id} · {row.statut || 'Statut indisponible'}</p>
              {key==='orders'?<p>Montant : {financeRecordedNumber(row.total)} · Commission : {financeRecordedNumber(row.commission_montant)}</p>
                :<><p>Montant : {financeRecordedNumber(row.montant)}</p><p>Justificatif : {row.has_payment_proof?'présence enregistrée, accès indisponible':'présence non attestée'}. Aucune validation possible ici.</p></>}
            </li>)}
          </ul>}
          {section.rows.length===0 && <p>Aucune ligne dans cette réponse.</p>}
          {section.hasMore?<><p>Liste partielle : ne pas en déduire un total.</p><button type="button" onClick={()=>onLoad(key,{next:true})}>Charger la suite</button></>
            :key!=='facts' && <p>Fin des pages consultées, sans garantie de photographie immuable des données.</p>}
        </>}
      </section>;
    })}
  </section>;
}

