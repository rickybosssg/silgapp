const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const esbuild = require('esbuild');
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  const root = process.env.SILGAPP_PLAYWRIGHT_ROOT || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node');
  ({ chromium } = createRequire(path.join(root, 'package.json'))('playwright'));
}
(async () => {
  const root = process.cwd();
  const built = await esbuild.build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Overlay from './src/components/livreur/LivreurVictoryOverlay.jsx';
    function Harness() {
      const [id,setId]=React.useState('test-a'); const [tick,setTick]=React.useState(0);
      window.nextDelivery=setId;
      React.useEffect(()=>{const timer=setInterval(()=>setTick(t=>t+1),100);return()=>clearInterval(timer);},[]);
      return <Overlay courseId={id} onClose={()=>window.closes.push({id,tick})}/>;
    }
    window.closes=[];createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
  `, loader: 'jsx', resolveDir: root }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"development"' } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' });
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: built.outputFiles[0].text });
    for (const id of ['test-a', 'test-b']) {
      if (id === 'test-b') await page.evaluate(id => window.nextDelivery(id), id);
      await page.locator('h1').waitFor({ state: 'visible' });
      await page.waitForTimeout(9400);
      assert.equal(await page.locator('h1').count(), 0, 'overlay closes despite parent rerenders and StrictMode');
    }
    const closes = await page.evaluate(() => window.closes);
    assert.deepEqual(closes.map(c => c.id), ['test-a', 'test-b']);
    console.log('PASS: actual React overlay, two deliveries, 9-second timers, parent rerenders, StrictMode (desktop browser, no Android/backend).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
