import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { isAudioSettingsAdmin } from '../base44/shared/audioContract.js';

const mobile=readFileSync(new URL('../src/components/layout/MobileNav.jsx',import.meta.url),'utf8');
test('mobile country select has one flag source, explicit light contrast and accessible label',()=>{
 const node=ts.createSourceFile('MobileNav.jsx',mobile,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 const selects=[];const visit=n=>{if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(node)==='select')selects.push(n);ts.forEachChild(n,visit);};visit(node);
 assert.equal(selects.length,1);
 const select=selects[0].getText(node);
 assert.match(select,/aria-label="Pays des données administrateur"/);
 assert.match(select,/colorScheme: 'light'/);assert.match(select,/backgroundColor: '#ffffff'/);assert.match(select,/color: '#111827'/);
 assert.doesNotMatch(select,/bg-white\/5|bg-sidebar-accent|text-slate-200/);
 assert.equal((select.match(/p\.emoji_flag/g)||[]).length,1);
 assert.doesNotMatch(mobile,/effectiveCountry\)\?\.emoji_flag/);
 assert.match(select,/setSelectedCountry\(e.target.value\)/);
 assert.match(mobile,/const effectiveCountry = isPays \? adminCountryCode : selectedCountry/);
 assert.match(mobile,/const showCountryPicker = reseau === "externe" && !isPays/);
});

function contextHarness(actor,storage){
 let source=readFileSync(new URL('../src/hooks/useAdminContext.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function useAdminContext','return function useAdminContext');
 const slots=[];let cursor=0;const effects=[];
 const useState=init=>{const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>{slots[i]=v;}];};
 const useEffect=fn=>{const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn);}};
 const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const hook=new Function('useState','useEffect','base44','localStorage',source)(useState,useEffect,{auth:{me:async()=>actor}},localStorage);
 return {render:()=>{cursor=0;const result=hook();effects.splice(0).forEach(fn=>fn());return result;}};
}
test('existing admin context persists global country and restores it without expanding country-admin scope',async()=>{
 const storage=new Map();const admin={id:'test-admin',role:'admin',admin_type:'global'};
 const global=contextHarness(admin,storage);global.render();await Promise.resolve();
 global.render().setSelectedCountry('CI');assert.equal(global.render().selectedCountry,'CI');
 const reopened=contextHarness(admin,storage);reopened.render();await Promise.resolve();assert.equal(reopened.render().selectedCountry,'CI');
 const country=contextHarness({...admin,admin_type:'pays',country_code:'BF'},storage);country.render();await Promise.resolve();
 assert.equal(country.render().selectedCountry,'BF');assert.equal(country.render().isPays,true);
 country.render().setSelectedCountry('CI');assert.equal(country.render().selectedCountry,'BF');
});

test('express navigation is guarded in both menus and reuses server-protected settings',()=>{
 const sidebar=readFileSync(new URL('../src/components/layout/Sidebar.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(sidebar,/path: "\/admin\/commande-express", label: "Commande express", icon: Mic, superAdminOnly: true/);
 for(const source of [mobile,sidebar]){
  assert.match(source,/const canManageExpress = isAudioSettingsAdmin\(user\)/);
  assert.match(source,/filter\(item => !item.superAdminOnly \|\| canManageExpress\)/);
 }
 assert.match(app,/path="\/admin\/commande-express"/);
 const page=readFileSync(new URL('../src/pages/CommandeExpressAdmin.jsx',import.meta.url),'utf8');assert.match(page,/<AudioTranscriptionSettings/);
});

test('canonical global admin includes unscoped legacy admin but never a country or enterprise admin',()=>{
 assert.equal(isAudioSettingsAdmin({role:'admin'}),true);
 assert.equal(isAudioSettingsAdmin({role:'admin',admin_type:'global'}),true);
 for(const user of [null,{role:'user'},{role:'admin',country_code:'BF'},{role:'admin',admin_type:'pays'},{role:'admin',admin_type:'pays',country_code:'BF'},{role:'admin',enterprise_id:'enterprise'},{role:'admin',silgapp_role:'admin_entreprise'},{role:'admin',admin_type:'unknown'}])assert.equal(isAudioSettingsAdmin(user),false);
});
