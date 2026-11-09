import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGuestAds, safeAdHttps, publicGuestAd, guestAdLink, sendGuestAdEvent } from '../src/lib/guestAdsClient.js';
test('guest advertising sends no identity, phone or course capabilities', async () => {
 let sent; const api={functions:{invoke:async (...args)=>{sent=args;return {data:{success:true,ads:[{id:'ad1',titre:'Pub',annonceur_contact:'private',user_id:'private'}]}};}}};
 const ads=await loadGuestAds(api,'BF'); assert.deepEqual(sent,['guestAds',{action:'list',country_code:'BF'}]);
 assert.equal(ads.length,1); assert.equal(ads[0].annonceur_contact,undefined); assert.equal(ads[0].user_id,undefined);
});
test('unknown country rejected without request', async()=>{await assert.rejects(loadGuestAds({},'bf'));});
test('malformed results are not success',async()=>{for(const data of [{},{success:false,ads:[]},{success:true,ads:null}]) await assert.rejects(loadGuestAds({functions:{invoke:async()=>({data})}}));});
test('public response caps list and removes invalid entries',async()=>{const result=await loadGuestAds({functions:{invoke:async()=>({success:true,ads:Array.from({length:20},(_,i)=>({id:String(i),titre:'x'}))})}});assert.equal(result.length,12);assert.equal(publicGuestAd({titre:'bad'}),null);});
test('links cannot execute scripts or leak URL credentials',()=>{for(const value of ['javascript:alert(1)','data:text/html,x','http://example.com','https://user:pass@example.com'])assert.equal(safeAdHttps(value),'');assert.equal(guestAdLink(publicGuestAd({id:'a',titre:'A',lien_whatsapp:'+22670000000'})),'https://wa.me/22670000000');});
test('option is explicit and older campaigns stay excluded',()=>{const schema=JSON.parse(fs.readFileSync('base44/entities/Publicite.jsonc'));assert.equal(schema.properties.visible_invites.default,false);const admin=fs.readFileSync('src/pages/GestionPublicites.jsx','utf8');assert.match(admin,/visible_invites: false/);assert.match(admin,/visible_invites: pub.visible_invites === true/);});
test('guest UI never blocks course or invokes entities or automatic tracking',()=>{const ui=fs.readFileSync('src/components/guest/GuestAds.jsx','utf8');assert.doesNotMatch(ui,/entities\.|trackAction|localStorage|autoPlay|setInterval|read_token|action_token|device_token/);assert.match(ui,/result.country === selected/);assert.match(ui,/current = false/);const home=fs.readFileSync('src/components/guest/GuestClientHome.jsx','utf8');assert.ok(home.indexOf('<GuestAds')>home.indexOf('<SuivreCourseCard'));});

test('measurement stays off without explicit gate and never retries uncertain event',async()=>{let calls=0;const api={functions:{invoke:async()=>{calls++;throw Error('uncertain');}}};const id='12345678-1234-4123-8123-123456789abc';assert.equal(await sendGuestAdEvent(api,false,'ad1','BF','affichage',id),false);assert.equal(calls,0);assert.equal(await sendGuestAdEvent(api,true,'ad1','BF','affichage',id),false);assert.equal(calls,1);});
