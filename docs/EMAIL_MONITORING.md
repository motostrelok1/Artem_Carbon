# PR #72 — Email-уведомления мониторинга Artem Carbon

**Получатель:** `motostrelok@yandex.ru`. Мониторинг каждые пять минут уже установлен PR #71; этот PR добавляет SMTP-отправку и **не изменяет** Nginx, UFW, Fail2ban, платежи или настройки других почтовых сервисов.

## Принцип работы

- Для каждого инцидента отправляется **одно** письмо с темой `[Artem Carbon] Аварийное уведомление`.
- После восстановления отправляется **одно** письмо `[Artem Carbon] Восстановление`.
- Ключ инцидента и статус сохраняются в `/var/lib/artemcarbon-monitor/state.json`. При ошибке отправки мониторинг повторяет попытку через пять минут.
- **Email основной**, Telegram — резервный только при неудачной попытке email, если он когда-нибудь снова станет доступен.
- Не передаются IP посетителей, данные заказов, URL запросов или секреты.
- SMTP использует **только** SSL/TLS на порту 465 или STARTTLS на порту 587 с проверкой системных доверенных CA; незашифрованный SMTP отклоняется.
- Запуск после merge устанавливает новый скрипт на VDS, но **без создания и активации учётных данных**. Пока SMTP не настроен, писем не будет.

## Настройка почтового отправителя на VDS

Уже есть конфигурационный файл `/etc/artemcarbon-monitor.env` из PR #71. Если файла нет:

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/artemcarbon-monitor.env
```

Отредактировать **только на сервере**:

```bash
sudo nano /etc/artemcarbon-monitor.env
```

Добавить строки ниже, не удаляя другие настройки. Указать существующий **почтовый ящик отправителя** и его отдельный пароль для внешнего почтового клиента (при необходимости создать его в настройках Mail.ru):

```ini
ARTEM_MONITOR_EMAIL_TO=motostrelok@yandex.ru
ARTEM_MONITOR_SMTP_HOST=smtp.mail.ru
ARTEM_MONITOR_SMTP_PORT=465
ARTEM_MONITOR_SMTP_USER=YOUR_MAIL_RU_SENDER@example.com
ARTEM_MONITOR_SMTP_PASSWORD=YOUR_MAIL_APP_PASSWORD
ARTEM_MONITOR_SMTP_FROM=YOUR_MAIL_RU_SENDER@example.com
```

Если у отправителя SMTP другой провайдер, использовать его подтверждённые сервер, порт и учётные данные.

**Не копировать весь `/opt/artems-carbon/server/.env` в конфигурацию мониторинга:** он содержит секреты базы данных, сессий и платёжного API. Использовать только отдельные значения SMTP. Этот PR **не требует** `EMAIL_ENABLED=true` и никак не меняет транзакционные письма покупателям.

Проверить права:

```bash
sudo chown root:root /etc/artemcarbon-monitor.env
sudo chmod 600 /etc/artemcarbon-monitor.env
```

## Отправка тестового письма

После зелёного GitHub Actions деплоя:

```bash
sudo bash -c 'set -a; . /etc/artemcarbon-monitor.env; set +a; exec python3 /usr/local/libexec/artemcarbon-monitor/check.py --test-email'
```

Ожидается `Email test sent` и письмо на `motostrelok@yandex.ru`. Команда не выводит пароль. **При редактировании env заключать значения с пробелами или специальными символами в кавычки по синтаксису shell**; проще использовать пароль приложения без спецсимволов, если провайдер поддерживает. Файл должен оставаться root-only.

Проверить таймер и журнал:

```bash
sudo systemctl is-active artemcarbon-monitor.timer
sudo systemctl start artemcarbon-monitor.service
sudo journalctl -u artemcarbon-monitor.service -n 30 --no-pager
```

Мониторинг не требует перезапуска сайта. При следующем срабатывании systemd автоматически подхватит переменные из env.

## Ограничения

- При полном отказе сервера или отсутствии интернета сам VDS не сможет отправить письмо — нужен независимый внешний uptime-monitor.
- При временном отказе SMTP уведомление задержится; повтор будет через 5 минут, если инцидент ещё открыт.
- Мониторинг не меняет существующие пороги PR #71. Никакие тестовые отключения реальных Nginx/PostgreSQL/SSH не требуются.
- Если SMTP не настроен и Telegram недоступен, уведомления будут только фиксироваться локально до восстановления канала.
