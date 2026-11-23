const status=document.getElementById('lessonStatus');
const player=document.getElementById('lessonVideo');
const order=new URLSearchParams(location.search).get('order');
const token=new URLSearchParams(location.hash.slice(1)).get('token');
// Never retain access credentials in browser history after the page loads.
history.replaceState(null,'',location.pathname+location.search);
async function openLesson(){
 if(!order||!token){
  status.textContent='В ссылке отсутствует код доступа. Откройте ссылку из письма целиком.';
  return;
 }
 try{
  const response=await fetch('/api/lesson/start',{
   method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
   cache:'no-store',body:JSON.stringify({order,token})
  });
  if(!response.ok){
   status.textContent=response.status===503
    ?'Видеоурок пока не опубликован. Обратитесь к организатору.'
    :'Доступ не подтверждён. Проверьте ссылку или статус заказа.';
   return;
  }
  player.src='/api/lesson/media?order='+encodeURIComponent(order);
  player.hidden=false;
  status.textContent='Доступ подтверждён. Нажмите воспроизведение.';
 }catch{
  status.textContent='Не удалось подключиться к серверу. Повторите попытку позже.';
 }
}
player.addEventListener('error',()=>{
 status.textContent='Ошибка загрузки видео. Попробуйте открыть ссылку повторно.';
});
openLesson();
