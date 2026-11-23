import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 lessonDeliveryReady,createLessonAccessUrl,signLessonLink,
 verifyLessonLink,makeLessonSessionCookie,verifyLessonSession,parseVideoRange
} from '../src/lesson-access.js';
import {purchaseMessage} from '../src/email-template.js';

const order='453ca15e-2d0b-498f-a420-f59b6cd7c513';
const other='3abc1234-5678-4567-8abc-123456789012';
const secret='secure-secret-for-tests-'.repeat(3);
const origin='https://api.artemcarbon.ru';

test('lesson link generated only with real private video, strong secret and HTTPS',()=>{
 const dir=mkdtempSync(join(tmpdir(),'artemcarbon-private-'));
 const video=join(dir,'lesson.mp4');
 try{
  assert.equal(createLessonAccessUrl(order,{secret,path:video,origin}),null);
  writeFileSync(video,Buffer.from('fake test video fixture'));
  assert.equal(lessonDeliveryReady({secret,path:video,origin}),true);
  assert.equal(lessonDeliveryReady({secret:'short',path:video,origin}),false);
  assert.equal(lessonDeliveryReady({secret,path:video,origin:'http://api.artemcarbon.ru'}),false);
  const link=createLessonAccessUrl(order,{secret,path:video,origin});
  const parsed=new URL(link);
  assert.equal(parsed.pathname,'/api/lesson/watch');
  assert.equal(parsed.searchParams.get('order'),order);
  assert.equal(parsed.searchParams.has('token'),false);
  assert.match(parsed.hash,/^#token=[a-f0-9]{64}$/);
  const token=parsed.hash.slice('#token='.length);
  assert.equal(verifyLessonLink(order,token,secret),true);
  assert.equal(verifyLessonLink(other,token,secret),false);
  assert.equal(verifyLessonLink(order,'f'.repeat(64),secret),false);
  const mail=purchaseMessage({id:order,email:'buyer@example.org',amount_kopecks:200000,
   items:[{sku:'video_lesson',quantity:1,unit_price_kopecks:200000}],
   lessonNumbers:[6362],lessonAccessUrl:link});
  assert.ok(mail.text.includes(link));
  assert.ok(mail.html.includes(link.replaceAll('&','&amp;')));
  assert.match(mail.html,/6362/);
  assert.doesNotMatch(mail.text,/будет направлена отдельно/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('lesson cookie is signed, order-specific and expires after eight hours',()=>{
 const now=1763900000000;
 const cookie=makeLessonSessionCookie(order,{secret,now});
 assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 assert.equal(verifyLessonSession(cookie,order,{secret,now}),true);
 assert.equal(verifyLessonSession(cookie,other,{secret,now}),false);
 assert.equal(verifyLessonSession(cookie,order,{secret,now:now+8*3600*1000+1000}),false);
 assert.equal(verifyLessonSession(cookie.replace(/artems_lesson=./,'artems_lesson=x'),order,{secret,now}),false);
 assert.equal(verifyLessonSession(cookie,order,{secret:secret+'wrong',now}),false);
});

test('HTTP Range parser supports streaming and rejects malformed or multi-range headers',()=>{
 assert.deepEqual(parseVideoRange(undefined,1000),{start:0,end:999,partial:false});
 assert.deepEqual(parseVideoRange('bytes=0-99',1000),{start:0,end:99,partial:true});
 assert.deepEqual(parseVideoRange('bytes=900-',1000),{start:900,end:999,partial:true});
 assert.deepEqual(parseVideoRange('bytes=-100',1000),{start:900,end:999,partial:true});
 assert.deepEqual(parseVideoRange('bytes=990-2000',1000),{start:990,end:999,partial:true});
 for(const header of ['bytes=1000-','bytes=999-10','bytes=0-1,3-4','bytes=-0','other=0-1']){
  assert.throws(()=>parseVideoRange(header,1000),RangeError);
 }
});
