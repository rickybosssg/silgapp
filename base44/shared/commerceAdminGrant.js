// INACTIVE migration preparation. No real grants are provisioned here.
// This input MUST come from protected deployment configuration, never User/body data.
export function resolveCommerceAdminScope(user, rawServerConfig, now=Date.now()) {
  const reject=()=>{throw Object.assign(new Error('TRUSTED_ADMIN_SCOPE_REQUIRED'),{code:'TRUSTED_ADMIN_SCOPE_REQUIRED',status:403});};
  if(user?.role!=='admin'||!user.id||user.enterprise_id) reject();
  let config;try{config=JSON.parse(rawServerConfig||'null');}catch{reject();}
  if(config?.version!==1||!Array.isArray(config.grants)) reject();
  const matching=config.grants.filter(g=>g?.user_id===user.id);
  if(matching.length!==1) reject();
  const g=matching[0];
  const untilRevoked=g.expires_at===null&&g.until_revoked===true;
  const finiteExpiry=typeof g.expires_at==='string'&&(g.until_revoked===undefined||g.until_revoked===false)
    &&Number.isFinite(Date.parse(g.expires_at))&&Date.parse(g.expires_at)>now;
  if((!untilRevoked&&!finiteExpiry)||!['global','pays'].includes(g.scope)) reject();
  if(g.scope==='pays'&&!/^[A-Z]{2}$/.test(g.country_code||'')) reject();
  return Object.freeze({user_id:user.id,scope:g.scope,country_code:g.scope==='pays'?g.country_code:null,expires_at:g.expires_at,until_revoked:untilRevoked});
}
