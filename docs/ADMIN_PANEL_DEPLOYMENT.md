# Развёртывание административной панели на VDS

Админка должна открываться на том же origin, что и API, например `https://carbon-api.dvizh-school.ru/admin/`. Не размещать рабочую админку на GitHub Pages: браузер может блокировать cross-site cookie с `SameSite=Strict`.

## Переменные окружения

Добавить в приватный `/opt/artems-carbon/server/.env`:

- `ADMIN_PASSWORD_HASH=<salt>:<scrypt-hex>`
- `SESSION_SECRET=<случайный секрет не менее 32 байт>`
- `API_PUBLIC_URL=https://carbon-api.dvizh-school.ru`

Сгенерировать значения локально на VDS, не в GitHub и не отправлять их в чат:

```bash
cd /opt/artems-carbon/server
node --input-type=module <<'NODE'
import { randomBytes, scryptSync } from 'node:crypto';
const password = process.stdin.isTTY ? await new Promise(resolve => {
  process.stdout.write('Admin password: ');
  process.stdin.setRawMode?.(true);
  let value='';
  process.stdin.on('data', chunk => {
    const s=chunk.toString();
    if(s==='\n'||s==='\r'){process.stdin.setRawMode?.(false);process.stdout.write('\n');resolve(value);}
    else if(s==='\u0003')process.exit(1); else value+=s;
  });
}) : '';
if(!password || password.length < 14) throw new Error('Use an admin password of at least 14 characters');
const salt=randomBytes(16).toString('hex');
const hash=scryptSync(password,salt,64).toString('hex');
console.log('ADMIN_PASSWORD_HASH='+salt+':'+hash);
console.log('SESSION_SECRET='+randomBytes(48).toString('base64url'));
NODE
```

Команда выше предназначена как шаблон; безопаснее вводить пароль через скрытый prompt и не сохранять его в shell history. Не использовать демонстрационный пароль 666666.

## Размещение файлов

Скопировать каталог `admin/` из проверенного релиза в каталог, доступный Nginx, например `/var/www/artems-carbon/admin/`. В Nginx на API-домене настроить отдельный location для статики `/admin/`, а остальные `/api/` запросы оставить проксируемыми на Node.js. Не делать alias на корень репозитория и не публиковать `.env`, сертификаты или SQL.

Примерная схема (пути сверить с действующим конфигом перед применением):

```nginx
location ^~ /admin/ {
    alias /var/www/artems-carbon/admin/;
    index index.html;
    try_files $uri $uri/ =404;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header Cache-Control "no-store" always;
}
```

Если админка будет размещена на основном домене сайта, API должен проксироваться под тем же origin, например `/api/`, а серверная проверка Origin и `API_PUBLIC_URL` должны быть согласованы. Не менять Origin/CORS вслепую.

## Применение и проверка

1. Сначала сделать резервную копию действующего Nginx-конфига и .env.
2. Установить переменные в приватный .env с правами `0600`.
3. Установить файлы admin из PR.
4. Проверить `nginx -t`, затем reload.
5. Перезапустить API и проверить `systemctl is-active artems-carbon`.
6. Без cookie `GET /api/admin/session` должен возвращать 401.
7. Войти через `/admin/`; после входа обзор должен загружаться.
8. Проверить logout и повторный запрос (401).
9. Проверить, что `PAYMENTS_ENABLED=false` не менялся.

**Не применять конфигурацию до проверки действующего Nginx server block и фактического API origin.**
