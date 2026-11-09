const dlg=document.getElementById('checkout');let qty=1;const fmt=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';function render(){document.getElementById('quantity').textContent=qty;document.getElementById('total').textContent=fmt(qty*2000)}document.getElementById('buyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('minus').addEventListener('click',()=>{qty=Math.max(1,qty-1);render()});document.getElementById('plus').addEventListener('click',()=>{qty=Math.min(100,qty+1);render()});document.getElementById('demoButton').addEventListener('click',()=>document.getElementById('demoMessage').textContent='Демонстрация: реальный заказ и оплата станут доступны после подключения сервера и эквайринга.');const menu=document.getElementById('mobileNav');document.getElementById('mobileMenu').addEventListener('click',()=>menu.classList.toggle('open'));menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));
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

/* Inline project carousel */

(()=>{
 const slides=[...document.querySelectorAll('.gallery-slide')];
 const thumbs=[...document.querySelectorAll('.gallery-thumb')];
 const count=document.getElementById('galleryCount');
 const stage=document.getElementById('galleryStage');
 let index=0;
 function show(n){
  index=(n+slides.length)%slides.length;
  slides.forEach((el,i)=>el.classList.toggle('active',i===index));
  thumbs.forEach((el,i)=>{el.classList.toggle('active',i===index);if(i===index)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current')});
  count.textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
 }
 document.getElementById('galleryPrev').addEventListener('click',()=>show(index-1));
 document.getElementById('galleryNext').addEventListener('click',()=>show(index+1));
 thumbs.forEach((el,i)=>el.addEventListener('click',()=>show(i)));
 document.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;if(document.activeElement.closest?.('.gallery')||document.activeElement===document.body){e.preventDefault();show(index+(e.key==='ArrowRight'?1:-1))}});
 let touchX=null;
 stage.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX},{passive:true});
 stage.addEventListener('touchend',e=>{if(touchX===null)return;const delta=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(delta)>45)show(index+(delta<0?1:-1))},{passive:true});
})();

