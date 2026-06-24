# Content Radar

Мини-сервис на Next.js для автоматического сбора мамского и детского контента из YouTube, Google News RSS и обычных RSS-лент. Сервис сохраняет только метаданные и ссылки, оценивает материалы по ключевым словам и отправляет сильные находки в закрытый Telegram-чат.

## Стек

- Next.js App Router
- Supabase
- Telegram Bot API
- YouTube Data API
- rss-parser

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```bash
YOUTUBE_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CONTENT_COLLECT_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` используется только на сервере: в route handlers, server actions и collector-коде.

## База данных

Примените миграцию:

```bash
supabase db push
```

Или выполните SQL из `supabase/migrations/001_content_radar.sql` в Supabase SQL editor.

## Запуск

```bash
npm install
npm run dev
```

Админка: `http://localhost:3000/dashboard/content`

## Cron

Endpoint:

```text
GET /api/content/collect?secret=CONTENT_COLLECT_SECRET
```

Также поддерживается заголовок:

```text
Authorization: Bearer CONTENT_COLLECT_SECRET
```

Ответ содержит количество найденных, сохранённых и отправленных материалов.

## Telegram webhook

Webhook endpoint:

```text
POST /api/telegram/content-bot
```

Пример установки webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://YOUR_DOMAIN/api/telegram/content-bot"
```

Бот принимает inline-кнопки для смены статуса и обычные сообщения со ссылками. Ручные ссылки сохраняются как `source_type=manual`.

## Ограничения

- Видео не скачиваются.
- Закрытые аккаунты не парсятся.
- TikTok и Instagram на первом этапе добавляются только ручной ссылкой через Telegram-бота.
- В `content_items` сохраняются только ссылки, заголовки, описания, источник, категория, оценка и редакторские поля.

Deployment trigger

Deployment trigger

Deployment trigger
