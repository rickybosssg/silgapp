const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const esbuild=require('esbuild');
const {chromium}=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright');
(async()=>{
 const root=process.cwd();
 const build=await esbuild.build({absWorkingDir:root,bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"'},
 stdin:{loader:'jsx',resolveDir:root,contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Recorder from './src/components/chat/AudioRecorder.jsx';import useViewport from './src/hooks/useChatViewport.js';
 function App(){const style=useViewport();return <div id="viewport" style={style}><input aria-label="Draft"/><Recorder onSend={window.sendAudio}/></div>;}createRoot(document.getElementById('root')).render(<App/>);`},
 plugins:[{name:'adapters',setup(b){b.onResolve({filter:/^@\//},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>{
  if(args.path.includes('base44Client'))return{contents:'export const base44=window.testApi;',loader:'js'};
  if(args.path.includes('chatUtils'))return{contents:require('node:fs').readFileSync(path.join(root,'src/lib/chatUtils.js'),'utf8'),loader:'js'};
  if(args.path.includes('button'))return{contents:'import React from "react";export const Button=({size,variant,...props})=><button {...props}/>;',loader:'jsx',resolveDir:root};
  throw Error(args.path);
 });}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');
  await page.evaluate(()=>{
   const viewport=new EventTarget();viewport.height=820;viewport.offsetTop=0;
   Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
   window.sent=[];window.uploads=0;
   window.testApi={integrations:{Core:{UploadFile:async()=>{window.uploads++;return{file_url:'https://example.invalid/audio.webm'};}}}};
   window.sendAudio=async payload=>{window.sent.push(payload);return window.sent.length>1;};
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
   window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.ondataavailable({data:new Blob(['fixture'],{type:'audio/webm'})});this.state='inactive';this.onstop();}};
  });
  await page.addScriptTag({content:build.outputFiles[0].text});
  await page.getByLabel('Draft').fill('preserved');
  await page.evaluate(()=>{window.visualViewport.height=420;window.visualViewport.dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>document.getElementById('viewport').style.height==='420px');
  assert.equal(await page.getByLabel('Draft').inputValue(),'preserved');
  assert.equal(await page.getByLabel('Draft').evaluate(node=>node===document.activeElement),true);
  await page.getByTitle('Message vocal').click();
  await page.getByLabel("Arrêter l'enregistrement").click();
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();
  await page.waitForFunction(()=>window.sent.length===1);
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();
  await page.waitForFunction(()=>window.sent.length===2);
  const result=await page.evaluate(()=>({sent:window.sent,uploads:window.uploads}));
  assert.equal(result.uploads,1);assert.deepEqual(result.sent[0],result.sent[1]);
  assert.ok(result.sent[0].client_message_id);
  await page.getByTitle('Message vocal').waitFor();
  console.log('PASS actual AudioRecorder uncertain-send retry keeps one upload/key; visual viewport resize preserves draft/focus (desktop Chrome, mocked media/backend)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
