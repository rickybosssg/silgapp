// Qualification only. Not imported by production screens. No automatic polling,
// subscriptions, payment actions, finance reconstruction or network retries.
import { readCommercePage } from './commerceGateway.js';

const actions = Object.freeze({ facts:'finance_establishment', orders:'finance_orders', payments:'payments' });
const emptySection = () => ({ status:'idle', rows:[], hasMore:false, nextOffset:null, error:null });
const emptySections = () => ({facts:emptySection(),orders:emptySection(),payments:emptySection()});
function fail(code) { throw new Error(code); }
function normalizeScope(scope) {
  if (!scope || !['boutique','restaurant'].includes(scope.type) || !['partner','admin'].includes(scope.audience)) fail('FINANCE_SCOPE_REQUIRED');
  for (const key of ['sessionId','parentId']) if (typeof scope[key] !== 'string' || !scope[key].trim()) fail('FINANCE_SCOPE_REQUIRED');
  if (typeof scope.countryCode !== 'string' || !/^[A-Z]{2}$/.test(scope.countryCode)) fail('FINANCE_SCOPE_REQUIRED');
  return { sessionId:scope.sessionId, parentId:scope.parentId, type:scope.type, audience:scope.audience, countryCode:scope.countryCode };
}
function project(row, keys) {
  const out={};
  for (const key of keys) if (Object.hasOwn(row,key) && (row[key] === null || ['string','number','boolean'].includes(typeof row[key]))) out[key]=row[key];
  return out;
}
function qualifyRows(section, rows, scope) {
  const parentKey=scope.type==='boutique'?'boutique_id':'restaurant_id';
  return rows.map(row=>{
    if (!row || typeof row.id !== 'string' || !row.id || row.pays_code !== scope.countryCode) fail('FINANCE_SCOPE_MISMATCH');
    if (section === 'facts') {
      if (row.id !== scope.parentId) fail('FINANCE_SCOPE_MISMATCH');
      return project(row,['id','nom','pays_code','commission_pct','montant_du_silga','nb_visites','derniere_visite_at','updated_date']);
    }
    if (section === 'orders') {
      if (row[parentKey] !== scope.parentId) fail('FINANCE_SCOPE_MISMATCH');
      return project(row,['id',parentKey,'pays_code','created_date','statut','total','commission_pct','commission_montant']);
    }
    if (row.etablissement_id !== scope.parentId || row.type !== scope.type) fail('FINANCE_SCOPE_MISMATCH');
    return project(row,['id','etablissement_id','type','pays_code','montant','statut','created_date','traite_at','motif_refus','has_payment_proof']);
  });
}
export function financeRecordedNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('fr-FR') : 'Indisponible';
}
/**
 * @typedef {{scope: ReturnType<typeof normalizeScope> | null, sections: ReturnType<typeof emptySections>}} FinancePreviewSnapshot
 */
/**
 * @param {{invoke: Parameters<typeof readCommercePage>[0], onChange?: (snapshot: FinancePreviewSnapshot) => void}} options
 */
export function createCommerceFinancePreview({invoke,onChange=()=>{}}) {
  let generation=0, disposed=false;
  let state={scope:null,sections:emptySections()};
  const pending=new Map();
  const snapshot=()=>structuredClone(state);
  const emit=()=>onChange(snapshot());
  function setScope(input) {
    if (disposed) fail('FINANCE_PREVIEW_DISPOSED');
    // Clear previous private records even when the new scope is invalid/logout.
    generation++;pending.clear();state={scope:null,sections:emptySections()};emit();
    if (input === null) return;
    const scope=normalizeScope(input);
    state={scope,sections:emptySections()};emit();
  }
  async function load(section,{next=false}={}) {
    if (!Object.hasOwn(actions,section)) fail('FINANCE_SECTION_INVALID');
    if (disposed || !state.scope) fail('FINANCE_SCOPE_REQUIRED');
    if (pending.has(section)) return pending.get(section);
    const current=state.sections[section];
    if (next && (section==='facts' || !current.hasMore || current.nextOffset === null || current.status !== 'ready')) fail('FINANCE_NEXT_PAGE_UNAVAILABLE');
    const scope={...state.scope}, epoch=generation;
    const offset=next?current.nextOffset:0;
    const prior=next?current.rows:[];
    state.sections[section]={...current,status:'loading',error:null};
    emit();
    const operation=(async()=>{
      try {
        const result=await readCommercePage(invoke,{
          type:scope.type,audience:scope.audience,action:actions[section],
          parent_id:scope.parentId,country_code:scope.countryCode,offset,limit:50,
        });
        if (disposed || generation !== epoch) return {ignored:true};
        if (section==='facts' && (result.rows.length!==1 || result.hasMore)) fail('FINANCE_FACTS_INVALID');
        const rows=qualifyRows(section,result.rows,scope);
        const ids=new Set(prior.map(r=>r.id));
        for(const row of rows) { if(ids.has(row.id)) fail('FINANCE_PAGINATION_CHANGED');ids.add(row.id); }
        state.sections[section]={status:'ready',rows:[...prior,...rows],hasMore:result.hasMore,nextOffset:result.nextOffset,error:null};
        emit();return {ignored:false};
      } catch(error) {
        if (disposed || generation !== epoch) return {ignored:true};
        const local=['FINANCE_SCOPE_MISMATCH','FINANCE_FACTS_INVALID','FINANCE_PAGINATION_CHANGED','COMMERCE_PAGINATION_INVALID','COMMERCE_PAGE_INVALID'];
        state.sections[section]={...current,status:'error',error:local.includes(error?.message)?error.message:'FINANCE_READ_UNAVAILABLE'};
        emit();return {ignored:false,error:state.sections[section].error};
      } finally {
        if (generation === epoch) pending.delete(section);
      }
    })();
    pending.set(section,operation);
    return operation;
  }
  function dispose() { generation++;disposed=true;pending.clear();state={scope:null,sections:emptySections()}; }
  return {setScope,load,snapshot,dispose};
}

