const assert = require('node:assert/strict');
const path = require('node:path');
const {createRequire} = require('node:module');
const esbuild = require('esbuild');
const {chromium} = createRequire(path.join(process.env.SILGAPP_PLAYWRIGHT_ROOT || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node'), 'package.json'))('playwright');
(async()=>{
 const root=process.cwd();
 const built=await esbuild.build({absWorkingDir:root,bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"'},
 stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Chat from './src/components/chat/ChatWindow.jsx';
 function App(){const[id,setId]=React.useState('a');window.changeCourse=setId;return <Chat courseId={id} senderType="client" senderId="client-test" senderName="TEST"/>;}createRoot(document.getElementById('root')).render(<App/>);`},
 plugins:[{name:'isolated',setup(build){
  build.onResolve({filter:/^@\//},args=>({path:args.path,namespace:'mock'}));
  build.onLoad({filter:/.*/,namespace:'mock'},args=>{
   if(args.path==='@/api/base44Client')return{contents:'export const base44=window.testApi;',loader:'js'};
   if(args.path.includes('chatUtils'))return{contents:require('node:fs').readFileSync(path.join(root,'src/lib/chatUtils.js'),'utf8'),loader:'js'};
   if(args.path.includes('chatReadState'))return{contents:require('node:fs').readFileSync(path.join(root,'src/lib/chatReadState.js'),'utf8'),loader:'js'};
   if(args.path.includes('ChatBubble'))return{contents:`import React from 'react';export default({message})=><div data-message={message.id}>{message.content}</div>;`,loader:'jsx',resolveDir:root};
   if(args.path.includes('AudioRecorder'))return{contents:'export default()=>null;',loader:'js'};
   if(args.path.includes('useSonEtVibration'))return{contents:'export const playNotificationSound=()=>{};',loader:'js'};
   if(args.path.includes('button'))return{contents:`import React from 'react';export const Button=props=><button {...props}/>;`,loader:'jsx',resolveDir:root};
   throw Error(args.path);
  });
 }}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();
 await page.setContent('<button data-venus-floating="true">Assistant</button><div id="root"></div>');
 await page.addStyleTag({content:require('node:fs').readFileSync(path.join(root,'src/index.css'),'utf8')});
 await page.evaluate(()=>{
  window.sent=[];window.reads=[];
  window.testApi={entities:{Message:{filter:async(filter,sort,limit,skip=0)=>{
   window.reads.push({filter,sort,limit,skip});return Array.from({length:Math.max(0,Math.min(limit,205-skip))},(_,i)=>({id:filter.course_id+'-'+(skip+i),course_id:filter.course_id,content:filter.course_id+' message '+(skip+i),created_date:new Date(2000000000000-(skip+i)*1000).toISOString(),sender_type:'client',sender_id:'client-test'}));},subscribe:()=>()=>{}},ClientExterne:{filter:async()=>[]}},functions:{invoke:async(name,payload)=>{window.sent.push(payload);throw Error('Offline test');}}};
 });
 await page.addScriptTag({content:built.outputFiles[0].text});
 await page.waitForSelector('[data-message="a-99"]');
 assert.equal(await page.locator('[data-venus-floating]').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 await page.locator('[data-silgapp-chat-active]').evaluate(el=>el.removeAttribute('data-silgapp-chat-active'));
 assert.equal(await page.locator('[data-venus-floating]').evaluate(el=>getComputedStyle(el).visibility),'visible');
 await page.locator('textarea').evaluate(el=>el.closest('.flex').parentElement.setAttribute('data-silgapp-chat-active','true'));
 assert.equal(await page.locator('[data-message]').count(),100);
 await page.getByRole('button',{name:'Messages plus anciens'}).click();
 await page.waitForSelector('[data-message="a-199"]');
 assert.equal(await page.locator('[data-message]').count(),200);
 await page.getByRole('button',{name:'Messages plus anciens'}).click();
 await page.waitForSelector('[data-message="a-204"]');
 assert.equal(await page.locator('[data-message]').count(),205);
 await page.locator('textarea').fill('retry test');
 await page.locator('textarea').press('Enter');
 await page.waitForFunction(()=>window.sent.length===1);
 assert.equal(await page.locator('textarea').inputValue(),'retry test');
 await page.locator('textarea').press('Enter');
 await page.waitForFunction(()=>window.sent.length===2);
 assert.equal(...await page.evaluate(()=>window.sent.map(p=>p.client_message_id)));
 await page.evaluate(()=>window.changeCourse('b'));
 await page.waitForSelector('[data-message="b-99"]');
 assert.equal(await page.locator('[data-message^="a-"]').count(),0);
 assert.equal(await page.locator('textarea').inputValue(),'');
 await page.evaluate(()=>{
  window.uploads=0;
  window.testApi.integrations={Core:{UploadFile:async()=>{window.uploads++;return {file_url:'https://example.invalid/test-video.mp4'};}}};
 });
 await page.locator('input[type="file"]').setInputFiles({name:'test-video.mp4',mimeType:'video/mp4',buffer:Buffer.from('isolated-fixture')});
 await page.getByRole('button',{name:"Réessayer l'envoi du fichier"}).waitFor();
 const media=await page.evaluate(()=>window.sent.at(-1));
 assert.equal(media.message_type,'video');
 await page.getByRole('button',{name:"Réessayer l'envoi du fichier"}).click();
 await page.waitForFunction(()=>window.sent.length===4);
 assert.equal(await page.evaluate(()=>window.uploads),1);
 assert.equal(await page.evaluate(()=>window.sent.at(-1).client_message_id),media.client_message_id);
 assert.equal(await page.evaluate(()=>window.sent.at(-1).video_url),media.video_url);
 console.log('PASS: actual ChatWindow pagination 205 messages, failed text/media retained, stable retry key without reupload, course isolation (mock backend, desktop Chrome).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
