# Развёртывание административной панели на VDS

Админка должна открываться на том же origin, что и API, например `https://carbon-api.dvizh-school.ru/admin/`. Не размещать рабочую админку на GitHub Pages: браузер может блокировать cross-site cookie с `SameSite=Strict`.

## Переменные окружения

Добавить в приватный `/opt/artems-carbon/server/.env`:

- `ADMIN_PASSWORD_HASH=<salt>:<scrypt-hex>`
- `SESSION_SECRET=<случайный секрет не менее 32 байт>`
- `API_PUBLIC_URL=https://carbon-api.dvizh-school.ru`

Сгенерировать значения локально на VDS. Ввод пароля скрытый; сам пароль не передавать в аргументах команды и не отправлять в чат:

```bash
read -rsp 'Новый пароль администратора: ' ADMIN_PASSWORD; echo
export ADMIN_PASSWORD
node --input-type=module <<'NODE'
import { randomBytes, scryptSync } from 'node:crypto';
const password = process.env.ADMIN_PASSWORD || '';
if (password.length < 14) throw new Error('Use an admin password of at least 14 characters');
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
console.log('ADMIN_PASSWORD_HASH=' + salt + ':' + hash);
console.log('SESSION_SECRET=' + randomBytes(48).toString('base64url'));
NODE
unset ADMIN_PASSWORD
```

Добавить выведенные значения в приватный `.env` вручную, не публиковать их. Рекомендуется использовать уникальный пароль не менее 14 символов и хранить резервную копию секретов в защищённом менеджере паролей.
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
