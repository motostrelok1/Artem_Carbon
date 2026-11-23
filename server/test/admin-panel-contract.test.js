import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('admin panel uses server-side session and has no demo password fallback', async()=>{
 const html=await read('../../admin/index.html');
 const js=await read('../../admin/admin.js');
 const api=await read('../src/app.js');
 assert.match(html,/admin\.js/);
 assert.match(html,/admin\.css/);
 assert.doesNotMatch(html,/666666|демо-админку/i);
 assert.doesNotMatch(js,/666666|localStorage|sessionStorage/);
 assert.match(js,/\/api\/admin\/login/);
 assert.match(js,/\/api\/admin\/session/);
 assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(api,/app\.get\('\/api\/admin\/session',adminAuth/);
 assert.match(api,/HttpOnly; Secure; SameSite=Strict/);
 assert.match(api,/scryptSync/);
});

test('all admin views are wired to read-only server endpoints', async()=>{
 const html=await read('../../admin/index.html');
 const js=await read('../../admin/admin.js');
 const api=await read('../src/app.js');
 for(const view of ['overview','analytics','orders','catalog','mail','system']){
  assert.match(html,new RegExp('data-view="'+view+'"'));
  assert.match(js,new RegExp(view+':load'));
 }
 for(const route of ['overview','analytics','orders','catalog','email-status','system']){
  assert.ok(api.includes('/api/admin/'+route), 'missing admin API route '+route);
 }
 assert.match(api,/app\.get\('\/api\/admin\/orders'/);
 assert.match(api,/app\.get\('\/api\/admin\/analytics'/);
 assert.match(api,/app\.get\('\/api\/admin\/email-status'/);
});

test('admin interface renders external data as text, not HTML', async()=>{
 const js=await read('../../admin/admin.js');
 assert.match(js,/textContent/);
 assert.match(js,/createElement/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});

test('unknown bank Init outcomes are visible to admin, not auto-released',async()=>{
 const js=await read('../../admin/admin.js');
 const api=await read('../src/app.js');
 assert.match(api,/payment_id_unconfirmed/);
 assert.match(api,/bank_review_required/);
 assert.match(api,/Payment initiation unconfirmed/);
 assert.match(js,/Нужна сверка с банком/);
 assert.match(js,/Не освобождать номера автоматически/);
});
