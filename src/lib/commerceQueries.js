// INACTIVE migration facades. No current screen imports this module.
import { readCommercePage, manageCommerceRecord } from './commerceGateway.js';
function clean(object) { return Object.fromEntries(Object.entries(object).filter(([,value]) => value !== undefined)); }
export function createCommerceQueries(invoke) {
  const read = request => readCommercePage(invoke, clean(request));
  const write = request => manageCommerceRecord(invoke, clean(request));
  const create = async request => {
    if (typeof request.request_id !== 'string' || !request.request_id.trim() || request.request_id.length > 200) throw new Error('REQUEST_ID_REQUIRED');
    const result = await write(request);
    const parentKey = request.type === 'restaurant' ? 'restaurant_id' : 'boutique_id';
    if (request.action === 'create_product' && result.record[parentKey] !== request.establishment_id) throw Object.assign(new Error('COMMERCE_CREATION_UNCONFIRMED'), { uncertain: true });
    if (request.action === 'create_establishment' && request.type === 'boutique' && result.record.pays_code !== request.data?.pays_code) throw Object.assign(new Error('COMMERCE_CREATION_UNCONFIRMED'), { uncertain: true });
    return result;
  };
  return {
    clientCatalogue: ({type,profileId,parentId,offset=0,limit=50}) => read({type,action:'catalogue',audience:'client',profile_id:profileId,parent_id:parentId,offset,limit}),
    clientProducts: ({type,profileId,parentId,offset=0,limit=50}) => read({type,action:'products',audience:'client',profile_id:profileId,parent_id:parentId,offset,limit}),
    partnerEstablishments: ({type,countryCode,offset=0,limit=50}) => read({type,action:'catalogue',audience:'partner',country_code:countryCode,offset,limit}),
    partnerProducts: ({type,parentId,offset=0,limit=50}) => read({type,action:'products',audience:'partner',parent_id:parentId,offset,limit}),
    adminEstablishments: ({type,countryCode,validation,newOnly=false,offset=0,limit=50}) => read({type,action:'catalogue',audience:'admin',country_code:countryCode,validation,creation_directe:newOnly?true:undefined,creation_admin_notifiee:newOnly?false:undefined,offset,limit}),
    adminProducts: ({type,parentId,countryCode,offset=0,limit=50}) => read({type,action:'products',audience:'admin',parent_id:parentId,country_code:countryCode,offset,limit}),
    orders: ({type,audience,profileId,parentId,countryCode,offset=0,limit=50}) => read({type,action:'orders',audience,profile_id:profileId,parent_id:parentId,country_code:countryCode,offset,limit}),
    financialFacts: ({type,audience,parentId,countryCode}) => read({type,action:'finance_establishment',audience,parent_id:parentId,country_code:countryCode}),
    financialOrders: ({type,audience,parentId,countryCode,offset=0,limit=50}) => read({type,action:'finance_orders',audience,parent_id:parentId,country_code:countryCode,offset,limit}),
    payments: ({type,audience,parentId,countryCode,offset=0,limit=50}) => read({type,action:'payments',audience,parent_id:parentId,country_code:countryCode,offset,limit}),
    // Caller must persist one requestId across uncertainty/reconciliation. Never generate here.
    createEstablishment: ({type,data,requestId}) => create({type,action:'create_establishment',data,request_id:requestId}),
    createProduct: ({type,establishmentId,data,requestId}) => create({type,action:'create_product',establishment_id:establishmentId,data,request_id:requestId}),
    acknowledgeCreation: establishmentId => write({type:'boutique',action:'acknowledge_creation',establishment_id:establishmentId,data:{}}),
    setCommission: ({type,establishmentId,commission}) => write({type,action:'set_commission',establishment_id:establishmentId,data:{commission_pct:commission}}),
    moderate: ({type,establishmentId,productId,action,motif=''}) => write({type,action:productId?'moderate_product':'moderate_establishment',establishment_id:establishmentId,product_id:productId,data:{action,motif}}),
  };
}
