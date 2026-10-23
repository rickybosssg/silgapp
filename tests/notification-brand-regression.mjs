import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('web notifications reuse the unchanged official blue launcher',()=>{
  assert.deepEqual(readFileSync('public/silgapp-notification-blue.png'),readFileSync('android/app/src/main/res/mipmap-xxxhdpi/silgapp_launcher.png'));
  const web=readFileSync('src/lib/notifications.js','utf8');
  assert.match(web,/icon: options.icon \|\| "\/silgapp-notification-blue.png"/);
  assert.doesNotMatch(web,/options\.(?:icon|badge) \|\| "\/favicon.ico"/);
});
test('native urgent and default notifications have the blue large logo and FCM fallback',()=>{
  const source=readFileSync('android/app/src/main/java/com/silgapp2/app/SilgappFirebaseMessagingService.java','utf8');
  assert.equal(source.match(/\.setLargeIcon\(BitmapFactory.decodeResource\([^\n]+R.drawable.silgapp_notification_logo\)\)/g)?.length,2);
  assert.deepEqual(readFileSync('android/app/src/main/res/drawable/silgapp_notification_logo.png'),readFileSync('public/silgapp-notification-blue.png'));
  const manifest=readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
  assert.match(manifest,/default_notification_icon[\s\S]*?@drawable\/ic_stat_silgapp/);
  assert.match(manifest,/default_notification_color[\s\S]*?@color\/silgapp_notification_blue/);
  assert.match(readFileSync('android/app/src/main/res/drawable/ic_stat_silgapp.xml','utf8'),/#FFFFFFFF/);
  const gps=readFileSync('android/app/src/main/java/com/silgapp2/app/SilgappLocationService.java','utf8');
  assert.doesNotMatch(gps,/setSmallIcon\(R.mipmap.ic_launcher\)/);
  assert.match(gps,/setLargeIcon\(BitmapFactory.decodeResource\(getResources\(\), R.drawable.silgapp_notification_logo\)\)/);
});

test('Android retains the standard WebView input connection for numeric and text keyboards',()=>{
 const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
 assert.equal(config.android.captureInput,false);
 assert.equal(config.android.webContentsDebuggingEnabled,false);
 assert.equal(config.android.allowMixedContent,false);
 assert.equal(config.server.androidScheme,'https');
});
