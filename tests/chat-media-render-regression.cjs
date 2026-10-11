const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');

(async () => {
  const built = await esbuild.build({
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react-dom/server'],
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import Bubble from './src/components/chat/ChatBubble.jsx';
      module.exports = message => renderToStaticMarkup(<Bubble message={message} isMine={false}/>);
    ` },
    plugins: [{name: 'utils', setup(build) {
      build.onResolve({filter: /^@\/lib\/utils$/}, () => ({path: 'utils', namespace: 'isolated'}));
      build.onLoad({filter: /.*/, namespace: 'isolated'}, () => ({contents: 'export const cn=(...args)=>args.filter(Boolean).join(" ");'}));
    }}],
  });
  const loaded = new Module(`${process.cwd()}/tests/media-render.generated.cjs`, module);
  loaded.filename = `${process.cwd()}/tests/media-render.generated.cjs`;
  loaded.paths = module.paths;
  loaded._compile(built.outputFiles[0].text, loaded.filename);
  const render = loaded.exports;
  const base = {id: 'test', created_date: '2026-10-11T17:00:00Z', sender_type: 'client', sender_name: 'TEST'};
  assert.match(render({...base, message_type: 'video'}), /Vidéo indisponible/);
  assert.match(render({...base, message_type: 'video', video_url: 'https://example.invalid/test.webm'}), /<video[^>]+controls/);
  assert.match(render({...base, message_type: 'video', content: 'https://example.invalid/fallback.webm'}), /<video[^>]+fallback.webm/);
  assert.match(render({...base, message_type: 'video', content: 'javascript:invalid'}), /Vidéo indisponible/);
  assert.match(render({...base, message_type: 'photo', photo_url: 'https://example.invalid/test.png'}), /<img/);
  console.log('PASS actual ChatBubble server render: missing-video fallback, video controls, photo retained (isolated).');
})().catch(error => {console.error(error); process.exitCode = 1;});
