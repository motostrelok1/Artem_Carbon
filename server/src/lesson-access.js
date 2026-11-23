import {createHmac,timingSafeEqual} from 'node:crypto';
import {statSync} from 'node:fs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/i;
const SESSION_SECONDS=8*60*60;
const DEFAULT_VIDEO_PATH='/opt/artems-carbon/private-media/lesson.mp4';

export function lessonVideoPath(){
 return process.env.LESSON_VIDEO_PATH||DEFAULT_VIDEO_PATH;
}

export function lessonDeliveryReady({secret=process.env.LESSON_ACCESS_SECRET,path=lessonVideoPath(),origin=process.env.API_PUBLIC_URL}={}){
 if(typeof secret!=='string'||secret.length<32||!origin)return false;
 let url;
 try{url=new URL(origin)}catch{return false}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return false;
 try{const stat=statSync(path);return stat.isFile()&&stat.size>0}catch{return false}
}

function mac(secret,purpose,value){
 return createHmac('sha256',secret).update('artemcarbon:'+purpose+':'+value).digest('hex');
}
function safeMacEqual(expected,received){
 if(typeof received!=='string'||!HEX.test(received))return false;
 return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(received,'hex'));
}
export function signLessonLink(orderId,secret=process.env.LESSON_ACCESS_SECRET){
 if(!UUID.test(orderId)||typeof secret!=='string'||secret.length<32)throw Error('Lesson access is not configured');
 return mac(secret,'lesson-link',orderId.toLowerCase());
}
export function verifyLessonLink(orderId,token,secret=process.env.LESSON_ACCESS_SECRET){
 if(!UUID.test(orderId)||typeof secret!=='string'||secret.length<32)return false;
 return safeMacEqual(mac(secret,'lesson-link',orderId.toLowerCase()),token);
}
export function createLessonAccessUrl(orderId,{
 secret=process.env.LESSON_ACCESS_SECRET,
 path=lessonVideoPath(),origin=process.env.API_PUBLIC_URL
}={}){
 if(!lessonDeliveryReady({secret,path,origin}))return null;
 const url=new URL('/api/lesson/watch',origin);
 url.searchParams.set('order',orderId);
 url.hash='token='+signLessonLink(orderId,secret);
 return url.toString();
}
export function makeLessonSessionCookie(orderId,{
 secret=process.env.LESSON_ACCESS_SECRET,now=Date.now()
}={}){
 if(!UUID.test(orderId)||typeof secret!=='string'||secret.length<32)throw Error('Lesson access is not configured');
 const exp=Math.floor(now/1000)+SESSION_SECONDS;
 const body=orderId.toLowerCase()+'.'+exp;
 const sig=mac(secret,'lesson-session',body);
 return 'artems_lesson='+body+'.'+sig+'; Path=/api/lesson/; HttpOnly; Secure; SameSite=Strict; Max-Age='+SESSION_SECONDS;
}
export function verifyLessonSession(cookieHeader,orderId,{
 secret=process.env.LESSON_ACCESS_SECRET,now=Date.now()
}={}){
 if(!UUID.test(orderId)||typeof secret!=='string'||secret.length<32)return false;
 const cookie=String(cookieHeader||'').split(';').map(x=>x.trim())
  .find(x=>x.startsWith('artems_lesson='));
 if(!cookie)return false;
 const value=cookie.slice('artems_lesson='.length);
 const parts=value.split('.');
 if(parts.length!==3||parts[0].toLowerCase()!==orderId.toLowerCase()||
  !/^\d{10}$/.test(parts[1]))return false;
 const exp=Number(parts[1]),current=Math.floor(now/1000);
 if(exp<current||exp>current+SESSION_SECONDS)return false;
 return safeMacEqual(mac(secret,'lesson-session',parts[0]+'.'+parts[1]),parts[2]);
}
export function parseVideoRange(header,size){
 if(!Number.isSafeInteger(size)||size<1)throw RangeError('Invalid video size');
 if(header==null)return {start:0,end:size-1,partial:false};
 if(typeof header!=='string')throw RangeError('Invalid range');
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);
 if(!m||(m[1]===''&&m[2]===''))throw RangeError('Invalid range');
 let start,end;
 if(m[1]===''){
  const suffix=Number(m[2]);
  if(!Number.isSafeInteger(suffix)||suffix<=0)throw RangeError('Invalid range');
  start=Math.max(0,size-suffix);end=size-1;
 }else{
  start=Number(m[1]);
  end=m[2]===''?size-1:Number(m[2]);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)
   throw RangeError('Invalid range');
  end=Math.min(end,size-1);
 }
 return {start,end,partial:true};
}
