const dlg=document.getElementById('checkout');let qty=1;const fmt=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';function render(){document.getElementById('quantity').textContent=qty;document.getElementById('total').textContent=fmt(qty*2000)}document.getElementById('buyCourse').addEventListener('click',()=>{qty=1;render();dlg.showModal()});document.getElementById('minus').addEventListener('click',()=>{qty=Math.max(1,qty-1);render()});document.getElementById('plus').addEventListener('click',()=>{qty=Math.min(100,qty+1);render()});document.getElementById('demoButton').addEventListener('click',()=>document.getElementById('demoMessage').textContent='Демонстрация: реальный заказ и оплата станут доступны после подключения сервера и эквайринга.');const menu=document.getElementById('mobileNav');document.getElementById('mobileMenu').addEventListener('click',()=>menu.classList.toggle('open'));menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));
/* Background music: attempt on load, then unlock on user gesture when autoplay is blocked. */
(()=>{
 const audio=document.getElementById('siteMusic');
 const toggle=document.getElementById('musicToggle');
 const label=document.getElementById('musicLabel');
 if(!audio||!toggle||!label)return;
 audio.volume=0.32;
 let explicitlyOff=false;
 let pending=false;
 const sync=()=>{
   const playing=!audio.paused;
   label.textContent=playing?'МУЗЫКА: ВКЛ.':'МУЗЫКА: ВЫКЛ.';
   toggle.setAttribute('aria-pressed',String(playing));
   toggle.setAttribute('aria-label',playing?'Выключить музыку':'Включить музыку');
   toggle.title=playing?'Выключить музыку':'Включить музыку';
 };
 const play=async()=>{
   if(explicitlyOff||pending||!audio.paused)return;
   pending=true;
   try{await audio.play();}catch(error){
      if(error.name!=='NotAllowedError'&&error.name!=='AbortError'){
        toggle.title='Аудиофайл не загружен. Добавьте site-theme.mp3 в корень репозитория.';
      }
   }finally{pending=false;sync()}
 };
 toggle.addEventListener('click',()=>{
   if(audio.paused){explicitlyOff=false;void play();}
   else{explicitlyOff=true;audio.pause();sync();}
 });
 audio.addEventListener('play',sync);
 audio.addEventListener('pause',sync);
 audio.addEventListener('error',()=>{
   toggle.title='Аудиофайл не найден. Загрузите site-theme.mp3 в корень репозитория.';
   sync();
 });
 const unlock=event=>{
   if(event.target.closest?.('#musicToggle'))return;
   if(explicitlyOff||!audio.paused)return;
   void play();
 };
 document.addEventListener('pointerdown',unlock,{passive:true});
 document.addEventListener('keydown',unlock);
 window.addEventListener('load',()=>{void play()},{once:true});
 sync();
})();
