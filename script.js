const dlg=document.getElementById('checkout');let qty=1;const fmt=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';function render(){document.getElementById('quantity').textContent=qty;document.getElementById('total').textContent=fmt(qty*2000)}document.getElementById('buyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('buyCourseDetails').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('minus').addEventListener('click',()=>{qty=Math.max(1,qty-1);render()});document.getElementById('plus').addEventListener('click',()=>{qty=Math.min(100,qty+1);render()});document.getElementById('demoButton').addEventListener('click',()=>document.getElementById('demoMessage').textContent='Демонстрация: реальный заказ и оплата станут доступны после подключения сервера и эквайринга.');const menu=document.getElementById('mobileNav');document.getElementById('mobileMenu').addEventListener('click',()=>menu.classList.toggle('open'));menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));
/* Play ASAP where permitted; explicit gesture fallback for browser autoplay policy. */
(()=>{
 const audio=document.getElementById('siteMusic');
 const toggle=document.getElementById('musicToggle');
 const label=document.getElementById('musicLabel');
 const prompt=document.getElementById('musicPrompt');
 const start=document.getElementById('musicStart');
 const dismiss=document.getElementById('musicDismiss');
 if(!audio||!toggle||!label||!prompt||!start||!dismiss)return;
 audio.volume=0.32;
 let userDisabled=false;
 let pending=false;
 let dismissed=false;
 function sync(){
  const playing=!audio.paused;
  label.textContent=playing?'МУЗЫКА: ВКЛ.':'МУЗЫКА: ВЫКЛ.';
  toggle.setAttribute('aria-pressed',String(playing));
  toggle.setAttribute('aria-label',playing?'Выключить музыку':'Включить музыку');
  toggle.title=playing?'Выключить музыку':'Включить музыку';
  prompt.hidden=playing||userDisabled||dismissed;
 }
 async function startMusic(){
  if(userDisabled||pending||!audio.paused)return;
  pending=true;
  try{
   await audio.play();
  }catch(err){
   if(err?.name!=='NotAllowedError'&&err?.name!=='AbortError'){
    prompt.querySelector('span').textContent='Музыка недоступна: проверьте аудиофайл.';
   }
  }finally{pending=false;sync()}
 }
 function userStart(){
  userDisabled=false;dismissed=false;
  void startMusic();
 }
 toggle.addEventListener('click',()=>{
  if(audio.paused){userStart()}
  else{userDisabled=true;audio.pause();sync()}
 });
 start.addEventListener('click',userStart);
 dismiss.addEventListener('click',()=>{
  dismissed=true;sync();
 });
 audio.addEventListener('play',sync);
 audio.addEventListener('pause',sync);
 audio.addEventListener('error',()=>{
  prompt.querySelector('span').textContent='Музыка недоступна: проверьте аудиофайл.';
  sync();
 });
 function unlock(e){
  if(e.target?.closest?.('#musicToggle, #musicDismiss, #musicStart'))return;
  if(!userDisabled&&audio.paused)void startMusic();
 }
 document.addEventListener('pointerdown',unlock,{passive:true});
 document.addEventListener('keydown',unlock);
 window.addEventListener('pageshow',()=>{void startMusic()});
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&!userDisabled)void startMusic();
 });
 sync();
 // Script runs at end of body: make the first attempt immediately, not after all assets load.
 void startMusic();
})();

/* One-photo carousel with fullscreen viewer. */
(()=>{
 const stage=document.getElementById('galleryStage');
 const photo=document.getElementById('projectPhoto');
 const count=document.getElementById('galleryCount');
 const dots=[...document.querySelectorAll('.gallery-dot')];
 const lightbox=document.getElementById('galleryLightbox');
 const lightboxPhoto=document.getElementById('lightboxPhoto');
 const lightboxCount=document.getElementById('lightboxCounter');
 if(!stage||!photo||!count||!lightbox||!lightboxPhoto)return;
 const photos=['./1.jpg','./2.jpg','./3.jpg','./hero-car.jpg'];
 let current=0,stageTouch=null,lightboxTouch=null;
 photos.slice(1).forEach(src=>{const image=new Image();image.src=src});
 function show(next){
  current=(next+photos.length)%photos.length;
  photo.src=photos[current];lightboxPhoto.src=photos[current];
  const alt='Автомобиль ARTEMS CARBON — фото '+(current+1);
  photo.alt=alt;lightboxPhoto.alt=alt;
  const value=String(current+1).padStart(2,'0')+' / '+String(photos.length).padStart(2,'0');
  count.textContent=value;lightboxCount.textContent=value;
  dots.forEach((dot,i)=>{const active=i===current;dot.classList.toggle('active',active);dot.setAttribute('aria-pressed',String(active))});
 }
 function openViewer(){show(current);lightbox.showModal()}
 function swipe(element,get,set){
  element.addEventListener('touchstart',e=>set(e.changedTouches[0].clientX),{passive:true});
  element.addEventListener('touchend',e=>{const start=get();set(null);if(start===null)return;const dx=e.changedTouches[0].clientX-start;if(Math.abs(dx)>45)show(current+(dx<0?1:-1))},{passive:true});
 }
 document.getElementById('galleryPrev').addEventListener('click',()=>show(current-1));
 document.getElementById('galleryNext').addEventListener('click',()=>show(current+1));
 document.getElementById('galleryExpand').addEventListener('click',openViewer);
 photo.addEventListener('click',openViewer);
 photo.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openViewer()}});
 dots.forEach((dot,i)=>dot.addEventListener('click',()=>show(i)));
 document.getElementById('lightboxClose').addEventListener('click',()=>lightbox.close());
 document.getElementById('lightboxPrev').addEventListener('click',()=>show(current-1));
 document.getElementById('lightboxNext').addEventListener('click',()=>show(current+1));
 lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close()});
 document.addEventListener('keydown',e=>{
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
  if(!lightbox.open&&!stage.contains(document.activeElement))return;
  e.preventDefault();show(current+(e.key==='ArrowRight'?1:-1));
 });
 swipe(stage,()=>stageTouch,v=>stageTouch=v);
 swipe(lightbox,()=>lightboxTouch,v=>lightboxTouch=v);
})();
