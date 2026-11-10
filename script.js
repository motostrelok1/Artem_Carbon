const dlg=document.getElementById('checkout');let qty=1;const fmt=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';function render(){document.getElementById('quantity').textContent=qty;document.getElementById('total').textContent=fmt(qty*2000)}document.getElementById('buyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('buyCourseDetails').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('headerBuyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('mobileBuyCourse').addEventListener('click',()=>{menu.classList.remove('open');qty=1;render();dlg.showModal()});document.getElementById('minus').addEventListener('click',()=>{qty=Math.max(1,qty-1);render()});document.getElementById('plus').addEventListener('click',()=>{qty=Math.min(100,qty+1);render()});document.getElementById('demoButton').addEventListener('click',()=>document.getElementById('demoMessage').textContent='Демонстрация: реальный заказ и оплата станут доступны после подключения сервера и эквайринга.');const menu=document.getElementById('mobileNav');document.getElementById('mobileMenu').addEventListener('click',()=>menu.classList.toggle('open'));menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));
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


/* Independent product galleries and a shared fullscreen viewer. */
(()=>{
 const products={
  helmet:{name:'КАСКА КАРБОНОВАЯ',photos:['каска_1.jpg','каска_2.jpg','каска_3.jpg']},
  spoon:{name:'ЛОЖКА КАРБОНОВАЯ',photos:['ложка_4.jpg','ложка_5.jpg','ложка_6.jpg']},
  knife:{name:'НОЖ КАРБОНОВЫЙ',photos:['нож_7.jpg','нож_8.jpg','нож_9.jpg']}
 };
 const box=document.getElementById('productLightbox');
 const boxImage=document.getElementById('productLightboxPhoto');
 const boxCaption=document.getElementById('productLightboxCaption');
 if(!box||!boxImage||!boxCaption)return;
 let activeProduct=null,lightboxTouch=null;
 const states=new Map();
 const getSrc=(file)=>'./'+encodeURIComponent(file);
 function render(productId){
  const state=states.get(productId),product=products[productId];
  if(!state||!product)return;
  const index=state.index;
  state.image.src=getSrc(product.photos[index]);
  state.image.alt=product.name+', фотография '+(index+1)+' из '+product.photos.length;
  state.counter.textContent=String(index+1).padStart(2,'0')+' / '+String(product.photos.length).padStart(2,'0');
  if(activeProduct===productId){
   boxImage.src=getSrc(product.photos[index]);boxImage.alt=state.image.alt;
   boxCaption.textContent=product.name+' — '+(index+1)+' / '+product.photos.length;
  }
 }
 function switchPhoto(productId,delta){
  const state=states.get(productId);
  if(!state)return;
  state.index=(state.index+delta+products[productId].photos.length)%products[productId].photos.length;
  render(productId);
 }
 function openPhoto(productId){
  activeProduct=productId;
  render(productId);
  box.showModal();
 }
 document.querySelectorAll('.product-card[data-product]').forEach(card=>{
  const id=card.dataset.product;
  const image=card.querySelector('.product-gallery-photo');
  const counter=card.querySelector('.product-gallery-count');
  if(!products[id]||!image||!counter)return;
  states.set(id,{index:0,image,counter});
  card.querySelector('.product-gallery-prev').addEventListener('click',()=>switchPhoto(id,-1));
  card.querySelector('.product-gallery-next').addEventListener('click',()=>switchPhoto(id,1));
  card.querySelector('.product-gallery-expand').addEventListener('click',()=>openPhoto(id));
  image.addEventListener('click',()=>openPhoto(id));
  image.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();openPhoto(id)}
  });
  let x=null;
  const area=card.querySelector('.product-gallery');
  area.addEventListener('touchstart',e=>{x=e.changedTouches[0].clientX},{passive:true});
  area.addEventListener('touchend',e=>{
   if(x===null)return;
   const dx=e.changedTouches[0].clientX-x;x=null;
   if(Math.abs(dx)>45)switchPhoto(id,dx<0?1:-1);
  },{passive:true});
  render(id);
 });
 document.getElementById('productLightboxClose').addEventListener('click',()=>box.close());
 document.getElementById('productLightboxPrev').addEventListener('click',()=>switchPhoto(activeProduct,-1));
 document.getElementById('productLightboxNext').addEventListener('click',()=>switchPhoto(activeProduct,1));
 box.addEventListener('click',e=>{if(e.target===box)box.close()});
 box.addEventListener('close',()=>{activeProduct=null});
 document.addEventListener('keydown',e=>{
  if(!box.open||!['ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();switchPhoto(activeProduct,e.key==='ArrowRight'?1:-1);
 });
 box.addEventListener('touchstart',e=>{lightboxTouch=e.changedTouches[0].clientX},{passive:true});
 box.addEventListener('touchend',e=>{
  if(lightboxTouch===null)return;
  const dx=e.changedTouches[0].clientX-lightboxTouch;lightboxTouch=null;
  if(Math.abs(dx)>45)switchPhoto(activeProduct,dx<0?1:-1);
 },{passive:true});
})();
