const ARTEMS_API=document.querySelector('meta[name="artems-api-base"]')?.content?.trim()||'';
async function createPayment(sku,quantity,email){
 if(!ARTEMS_API)throw new Error('Оплата пока не подключена');
 const endpoint=new URL('/api/orders',ARTEMS_API);
 const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({items:[{sku,quantity}],email})});
 if(!res.ok)throw new Error(res.status===503?'Платежи пока недоступны':'Не удалось создать заказ');
 const data=await res.json();
 const url=new URL(data.paymentUrl);
 if(url.protocol!=='https:')throw new Error('Некорректная ссылка банка');
 window.location.assign(url.href);
}
const dlg=document.getElementById('checkout');let qty=1;const fmt=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';function render(){document.getElementById('quantity').textContent=qty;document.getElementById('total').textContent=fmt(qty*2000)}document.getElementById('buyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('buyCourseDetails').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('headerBuyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('mobileBuyCourse').addEventListener('click',()=>{menu.classList.remove('open');qty=1;render();dlg.showModal()});document.getElementById('minus').addEventListener('click',()=>{qty=Math.max(1,qty-1);render()});document.getElementById('plus').addEventListener('click',()=>{qty=Math.min(100,qty+1);render()});document.getElementById('demoButton').addEventListener('click',async()=>{
 const message=document.getElementById('demoMessage');
 const email=document.getElementById('courseBuyerEmail');
 if(!ARTEMS_API){message.textContent='Демонстрация: оплата появится после подключения сервера и банка.';return;}
 if(!email.reportValidity()||!email.value.trim()){email.focus();email.setCustomValidity('Укажите email');email.reportValidity();email.setCustomValidity('');return;}
 try{message.textContent='Создаём заказ…';await createPayment('video_lesson',qty,email.value.trim())}
 catch(error){message.textContent=error.message}
});const menu=document.getElementById('mobileNav');document.getElementById('mobileMenu').addEventListener('click',()=>menu.classList.toggle('open'));menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));
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

/* Product purchase preview: photo carousel, details, quantity and total. */
(()=>{
 const catalog={
  helmet:{name:'КАСКА КАРБОНОВАЯ',price:35000,photos:['каска_1.jpg','каска_2.jpg','каска_3.jpg']},
  spoon:{name:'ЛОЖКА КАРБОНОВАЯ',price:25000,photos:['ложка_4.jpg','ложка_5.jpg','ложка_6.jpg']},
  knife:{name:'НОЖ КАРБОНОВЫЙ',price:10000,photos:['нож_7.jpg','нож_8.jpg','нож_9.jpg']}
 };
 const dialog=document.getElementById('productCheckout');
 const $=id=>document.getElementById(id);
 const image=$('productCheckoutPhoto');
 const expanded=$('productLightbox');
 let current=null,number=0,quantity=1;
 const fmtPrice=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
 function render(){
  if(!current)return;
  const item=catalog[current];
  image.src='./'+encodeURIComponent(item.photos[number]);
  image.alt=item.name+', фото '+(number+1)+' из '+item.photos.length;
  $('productCheckoutCount').textContent=String(number+1).padStart(2,'0')+' / '+String(item.photos.length).padStart(2,'0');
  $('productCheckoutName').textContent=item.name;
  $('productCheckoutUnitPrice').textContent=fmtPrice(item.price);
  $('productCheckoutQuantity').textContent=quantity;
  $('productCheckoutTotal').textContent=fmtPrice(item.price*quantity);
 }
 function next(delta){
  if(!current)return;
  number=(number+delta+catalog[current].photos.length)%catalog[current].photos.length;render();
 }
 document.querySelectorAll('.product-card[data-product] .product-buy-button').forEach(button=>{
  button.addEventListener('click',()=>{
   current=button.closest('[data-product]').dataset.product;
   number=0;quantity=1;
   $('productCheckoutMessage').textContent='';
   render();dialog.showModal();
  });
 });
 $('productCheckoutPrev').addEventListener('click',()=>next(-1));
 $('productCheckoutNext').addEventListener('click',()=>next(1));
 $('productCheckoutMinus').addEventListener('click',()=>{quantity=Math.max(1,quantity-1);render()});
 $('productCheckoutPlus').addEventListener('click',()=>{quantity=Math.min(100,quantity+1);render()});
 $('productCheckoutClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 $('productCheckoutContinue').addEventListener('click',async()=>{
 const message=$('productCheckoutMessage');const input=$('productBuyerEmail');
 if(!ARTEMS_API){message.textContent='Оплата пока не подключена. Заказ не создан.';return;}
 if(!input.value.trim()||!input.reportValidity()){input.focus();message.textContent='Укажите email';return;}
 const skus={helmet:'carbon_helmet',spoon:'carbon_spoon',knife:'carbon_knife'};
 try{message.textContent='Создаём заказ…';await createPayment(skus[current],quantity,input.value.trim())}
 catch(error){message.textContent=error.message}
});
 $('productCheckoutExpand').addEventListener('click',()=>{
  if(!current)return;
  dialog.close();
  const card=document.querySelector('.product-card[data-product="'+current+'"]');
  if(!card)return;
  // Fullscreen gallery opens on the same image as the purchase preview.
  const statePhoto=card.querySelector('.product-gallery-photo');
  const all=catalog[current].photos;
  const desired='./'+encodeURIComponent(all[number]);
  let index=0;
  while(index<all.length&&new URL(statePhoto.src,location.href).pathname!==new URL(desired,location.href).pathname){
   card.querySelector('.product-gallery-next').click();
   index++;
  }
  card.querySelector('.product-gallery-expand').click();
 });
 let touchX=null;
 const region=dialog.querySelector('.product-checkout-photo-wrap');
 region.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX},{passive:true});
 region.addEventListener('touchend',e=>{if(touchX===null)return;const dx=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(dx)>40)next(dx<0?1:-1)},{passive:true});
})();

/* Public confirmed lesson sales, read-only. No hardcoded fake sales. */
(()=>{
 const total=9500;
 const sold=document.getElementById('soldLessons');
 const progress=document.getElementById('lessonSalesProgress');
 const fill=document.getElementById('lessonSalesFill');
 const caption=document.getElementById('lessonSalesCaption');
 const base=document.querySelector('meta[name="artems-api-base"]')?.content?.trim();
 if(!sold||!progress||!fill||!caption)return;
 function unavailable(){
  sold.textContent='—';fill.style.width='0%';
  progress.removeAttribute('aria-valuenow');
  progress.setAttribute('aria-valuetext','Нет подтверждённых данных');
  caption.textContent='Данные появятся после подключения оплаты';
 }
 unavailable();
 if(!base)return;
 async function refresh(){
  try{
   const url=new URL('/api/public/stats',base);
   const res=await fetch(url.toString(),{headers:{Accept:'application/json'},cache:'no-store'});
   if(!res.ok)throw new Error('Statistics unavailable');
   const stats=await res.json();
   const n=stats?.soldLessons;
   if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)throw new Error('Invalid sales counter');
   const count=Math.min(total,n);
   sold.textContent=new Intl.NumberFormat('ru-RU').format(count);
   const percent=100*count/total;
   fill.style.width=percent.toFixed(2)+'%';
   progress.setAttribute('aria-valuenow',String(count));
   progress.setAttribute('aria-valuetext','Продано '+count+' из '+total);
   caption.textContent='Осталось '+new Intl.NumberFormat('ru-RU').format(total-count)+' видеоуроков';
  }catch(error){unavailable();}
 }
 refresh();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
