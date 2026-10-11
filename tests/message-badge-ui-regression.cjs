const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright');
(async () => {
  const root = process.cwd();
  const built = await esbuild.build({bundle: true, write: false, format: 'iife',
    define: {'process.env.NODE_ENV': '"development"'},
    stdin: {resolveDir: root, loader: 'jsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Messages from './src/components/chat/MessagesPage.jsx';createRoot(document.getElementById('root')).render(<Messages myType="livreur" myId="driver" myName="TEST"/>);`},
    plugins: [{name: 'isolate', setup(build) {
      build.onResolve({filter: /^@\//}, args => ({path: args.path, namespace: 'test'}));
      build.onLoad({filter: /.*/, namespace: 'test'}, args => {
        if (args.path.endsWith('base44Client')) return {contents: 'export const base44=window.testApi;'};
        if (args.path.endsWith('chatReadState')) return {contents: fs.readFileSync(path.join(root, 'src/lib/chatReadState.js'), 'utf8')};
        if (args.path.endsWith('/utils')) return {contents: 'export const cn=(...v)=>v.filter(Boolean).join(" ");'};
        if (args.path.endsWith('/button')) return {contents: 'import React from "react";export const Button=p=><button {...p}/>;', loader:'jsx', resolveDir:root};
        return {contents: 'export default()=>null;'};
      });
    }}]});
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage();
    await page.route('https://isolated.test/**', route => route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
    await page.goto('https://isolated.test');
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => {
      window.reads=[];window.incoming=[];
      window.testApi={entities:{Conversation:{list:async()=>[],subscribe:()=>()=>{}},CourseExterne:{filter:async()=>[{id:'test-course',adresse_depart:'TEST',adresse_arrivee:'TEST'}]},Message:{filter:async filter=>{window.reads.push(filter);return window.incoming;},subscribe:()=>()=>{}}}};
    });
    await page.addScriptTag({content:built.outputFiles[0].text});
    await page.getByText('Course #course').waitFor();
    assert.equal(await page.getByLabel('Message non lu').count(), 0);
    await page.evaluate(() => {
      window.incoming=[{id:'new',course_id:'test-course',sender_type:'client',sender_id:'client',created_date:'2026-10-11T18:00:00Z'}];
      window.dispatchEvent(new CustomEvent('silgapp:chat_refetch',{detail:{course_id:'test-course'}}));
    });
    await page.getByLabel('Message non lu').waitFor();
    assert.ok(await page.evaluate(()=>window.reads.some(r=>r.course_id==='test-course')));
    await page.evaluate(()=>localStorage.setItem('silgapp:chat-read:v1:livreur:driver:course_id:test-course',String(Date.parse('2026-10-11T18:00:00Z'))));
    await page.evaluate(()=>window.dispatchEvent(new Event('silgapp:chat-read')));
    await page.getByLabel('Message non lu').waitFor({state:'detached'});
    console.log('PASS actual MessagesPage: scoped push refresh, unread appears and clears (mock backend).');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
