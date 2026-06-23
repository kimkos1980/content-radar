# Telegram Collector

Отдельный Python collector для чтения Telegram-каналов обычным аккаунтом “Мамский Радар” через Telethon. Collector ничего не скачивает навсегда: он читает текст/caption и наличие media, сохраняет только ссылку, текст, id сообщения, название канала, тип медиа, category, score и matched keywords.

## Где взять TELEGRAM_API_ID и TELEGRAM_API_HASH

1. Откройте [my.telegram.org](https://my.telegram.org).
2. Войдите по номеру телефона аккаунта “Мамский Радар”.
3. Откройте `API development tools`.
4. Создайте приложение, например `Mom Radar`.
5. Скопируйте `api_id` в `TELEGRAM_API_ID`, а `api_hash` в `TELEGRAM_API_HASH`.

В `.env.local` проекта добавьте:

```env
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_SESSION_NAME=mom_radar
```

`TELEGRAM_PHONE` укажите в международном формате, например `+79990000000`.

## Установка зависимостей

```powershell
cd "C:\Users\User\Documents\Новостной радар"
python -m venv telegram_collector\.venv
telegram_collector\.venv\Scripts\Activate.ps1
pip install -r telegram_collector\requirements.txt
```

## Первая авторизация Telegram-аккаунта

После заполнения `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` и `TELEGRAM_PHONE` запустите collector вручную:

```powershell
python telegram_collector\collector.py
```

Telethon попросит код из Telegram. После успешного входа рядом с collector появится session-файл `mom_radar.session`. Его нельзя публиковать или коммитить.

## Как добавить канал

Аккаунт “Мамский Радар” должен быть подписан на канал. Затем добавьте канал в Supabase SQL Editor:

```sql
insert into public.telegram_channels (title, username, url, category, weight, enabled)
values (
  'Название канала',
  'channel_username',
  'https://t.me/channel_username',
  null,
  1,
  true
);
```

Для публичных каналов достаточно `username`. Для приватных каналов используйте `url`, если аккаунт уже состоит в канале и Telethon может его открыть.

## Ручной запуск

```powershell
cd "C:\Users\User\Documents\Новостной радар"
telegram_collector\.venv\Scripts\Activate.ps1
python telegram_collector\collector.py
```

Collector:
- берёт enabled-каналы из `telegram_channels`;
- читает сообщения после `last_message_id`;
- проверяет photo/video/document с video mime type;
- считает score по `content_keywords`;
- отсекает стоп-слова;
- сохраняет новые материалы в `content_items`;
- обновляет `last_message_id`;
- отправляет в чат “Контент радар” только материалы со `score >= 10`.
