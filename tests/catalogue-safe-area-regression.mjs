import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import {parse} from '@babel/parser';
const expected={
  "BoutiquesList": "fbcf20b51cfd6ce1ec85781135f6ba88130db8f72f0ac58b266d689d414e2e3c",
  "RestaurantsList": "636644161534c68c4be0490a8505365ad1ba9674e886e62bcac41f2b96b29839",
  "BoutiqueDetail": "7166cad0aac8e2e9013d91f85cb9553bf5709666c56bdd3c3fb59f9c09b490f8",
  "RestaurantDetail": "66e5cc0c148eba5a39b22949a44de3f3f15cbb008272eb1d2082ad6bd0659ba0"
};
function norm(s){return JSON.stringify(parse(s,{sourceType:'module',plugins:['jsx']}),(k,v)=>['start','end','loc','extra','comments','leadingComments','trailingComments'].includes(k)?undefined:v?.type==='JSXAttribute'&&v.name?.name==='className'?{type:'StyleClass'}:v)}
for(const [name,hash] of Object.entries(expected)){test(name+' preserves executable AST and JSX except presentation classes',()=>{const s=fs.readFileSync('src/pages/'+name+'.jsx','utf8');assert.equal(crypto.createHash('sha256').update(norm(s)).digest('hex'),hash)});test(name+' protects sticky header and errors with existing safe-area fallback',()=>{const s=fs.readFileSync('src/pages/'+name+'.jsx','utf8');const top=name==='BoutiqueDetail'?'.75rem':'1rem';assert.ok(s.includes('pt-[calc('+top+'+max(env(safe-area-inset-top),28px))] sticky top-0 z-20'));assert.ok(!s.includes('min-h-screen bg-gray-50 p-4"'));});}
