import {COMMERCE_OWNER_MIGRATION_ENABLED,ownerMigrationActive,createOwnerCommerce} from './commerceOwnerMigration.js';

export async function discoverAuthCommerce(sdk,user,enabled=COMMERCE_OWNER_MIGRATION_ENABLED) {
  if(!ownerMigrationActive(enabled,user)) {
    return Promise.all([
      sdk.entities.Boutique.filter({user_email:user.email}).catch(()=>[]),
      sdk.entities.Restaurant.filter({user_email:user.email}).catch(()=>[]),
      sdk.entities.Pharmacie.filter({user_email:user.email}).catch(()=>[]),
    ]);
  }
  try {
    const owner=createOwnerCommerce({sdk,actorId:user.id});
    const result=await Promise.all([
      owner.allEstablishments('boutique'),owner.allEstablishments('restaurant'),
      sdk.entities.Pharmacie.filter({user_email:user.email}),
    ]);
    if(!Array.isArray(result[2])) throw new Error('PHARMACY_DISCOVERY_INVALID');
    for(const rows of result.slice(0,2)) for(const row of rows) {
      if(!/^[A-Z]{2}$/.test(row.pays_code||'') || !['en_attente','valide','refuse','suspendu'].includes(row.validation)) throw new Error('OWNER_VALIDATION_UNAVAILABLE');
    }
    const current=await sdk.auth.me();
    if(current?.id!==user.id || current.role==='admin' || current.enterprise_id) throw new Error('OWNER_SESSION_CHANGED');
    return result;
  } catch(cause) {throw Object.assign(new Error('OWNER_DISCOVERY_UNAVAILABLE'),{cause});}
}
