import asyncio
import html
import json
import mimetypes
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.tl.custom.message import Message


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILES = [ROOT_DIR / ".env.local", ROOT_DIR / ".env"]

DEFAULT_STOP_WORDS = [
    "18+",
    "казино",
    "ставки",
    "букмекер",
    "промокод",
    "порно",
]


@dataclass
class Keyword:
    keyword: str
    language: str
    category: str
    weight: int


@dataclass
class ScoringResult:
    score: int
    category: str | None
    matched_keywords: list[str]


class SupabaseRestClient:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.base_url = url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_role_key,
                "authorization": f"Bearer {service_role_key}",
                "content-type": "application/json",
            }
        )

    def get(self, table: str, params: dict[str, str] | None = None) -> Any:
        response = self.session.get(
            f"{self.base_url}/rest/v1/{table}",
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def insert(self, table: str, payload: dict[str, Any]) -> Any:
        response = self.session.post(
            f"{self.base_url}/rest/v1/{table}",
            params={"on_conflict": "source_url"} if table == "content_items" else None,
            headers={"prefer": "resolution=ignore-duplicates,return=representation"},
            data=json.dumps(payload, ensure_ascii=False),
            timeout=30,
        )
        response.raise_for_status()
        if not response.text:
            return None
        data = response.json()
        return data[0] if data else None

    def patch(self, table: str, filters: dict[str, str], payload: dict[str, Any]) -> None:
        response = self.session.patch(
            f"{self.base_url}/rest/v1/{table}",
            params=filters,
            data=json.dumps(payload, ensure_ascii=False),
            timeout=30,
        )
        response.raise_for_status()


def load_environment() -> None:
    for env_file in ENV_FILES:
        if env_file.exists():
            load_dotenv(env_file, override=False)


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env variable: {name}")
    return value


def parse_stop_words() -> list[str]:
    extra = os.getenv("TELEGRAM_STOP_WORDS", "")
    words = DEFAULT_STOP_WORDS + [word.strip() for word in extra.split(",")]
    return [word.lower() for word in words if word.strip()]


def load_keywords(supabase: SupabaseRestClient) -> list[Keyword]:
    rows = supabase.get(
        "content_keywords",
        {
            "select": "keyword,language,category,weight",
            "enabled": "eq.true",
        },
    )
    return [
        Keyword(
            keyword=row["keyword"],
            language=row.get("language") or "ru",
            category=row["category"],
            weight=int(row.get("weight") or 1),
        )
        for row in rows
    ]


def score_text(text: str, keywords: list[Keyword], language: str) -> ScoringResult:
    normalized = text.casefold()
    matched: list[str] = []
    category_scores: dict[str, int] = {}
    raw_score = 0

    for keyword in keywords:
        if keyword.language not in {language, "all"}:
            continue

        needle = keyword.keyword.strip().casefold()
        if not needle:
            continue

        if needle in normalized:
            matched.append(keyword.keyword)
            raw_score += keyword.weight
            category_scores[keyword.category] = (
                category_scores.get(keyword.category, 0) + keyword.weight
            )

    category = None
    if category_scores:
        category = max(category_scores.items(), key=lambda item: item[1])[0]

    return ScoringResult(
        score=max(0, min(raw_score, 20)),
        category=category,
        matched_keywords=matched,
    )


def has_stop_word(text: str, stop_words: list[str]) -> bool:
    normalized = text.casefold()
    return any(word in normalized for word in stop_words)


def message_text(message: Message) -> str:
    return (message.message or "").strip()


def media_type(message: Message) -> str | None:
    if message.photo:
        return "photo"

    document = message.document
    if not document:
        return None

    mime_type = getattr(document, "mime_type", None)
    if mime_type and mime_type.startswith("video/"):
        return "video"

    file_name = getattr(message.file, "name", None)
    guessed_type = mimetypes.guess_type(file_name or "")[0]
    if guessed_type and guessed_type.startswith("video/"):
        return "video"

    return "document"


def channel_entity_ref(channel: dict[str, Any]) -> str:
    username = (channel.get("username") or "").strip().lstrip("@")
    if username:
        return username

    url = (channel.get("url") or "").strip()
    if url:
        return url

    raise RuntimeError(f"Channel {channel.get('title')} requires username or url")


def public_message_url(channel: dict[str, Any], message_id: int) -> str | None:
    username = (channel.get("username") or "").strip().lstrip("@")
    if username:
        return f"https://t.me/{username}/{message_id}"

    url = (channel.get("url") or "").rstrip("/")
    if re.match(r"^https://t\.me/[^/+][^/]*$", url):
        return f"{url}/{message_id}"

    return None


def build_editor_note(
    message: Message,
    media: str | None,
    matched_keywords: list[str],
) -> str:
    return json.dumps(
        {
            "telegram_message_id": message.id,
            "media_type": media,
            "matched_keywords": matched_keywords,
        },
        ensure_ascii=False,
    )


def build_bot_message(
    channel_title: str,
    category: str,
    score: int,
    matched_keywords: list[str],
    text: str,
    source_url: str,
) -> str:
    safe_text = text[:1800]
    return "\n".join(
        [
            "🔥 <b>Telegram-находка</b>",
            "",
            "<b>Канал:</b>",
            html.escape(channel_title),
            "",
            "<b>Категория:</b>",
            html.escape(category),
            "",
            "<b>Оценка:</b>",
            f"{score}/20",
            "",
            "<b>Почему попало:</b>",
            html.escape(", ".join(matched_keywords)),
            "",
            "<b>Текст:</b>",
            html.escape(safe_text),
            "",
            "<b>Ссылка:</b>",
            html.escape(source_url),
        ]
    )


def notify_bot(
    item_id: str,
    channel_title: str,
    category: str,
    score: int,
    matched_keywords: list[str],
    text: str,
    source_url: str,
) -> None:
    bot_token = required_env("TELEGRAM_BOT_TOKEN")
    chat_id = required_env("TELEGRAM_CHAT_ID")
    payload = {
        "chat_id": chat_id,
        "text": build_bot_message(
            channel_title,
            category,
            score,
            matched_keywords,
            text,
            source_url,
        ),
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
        "reply_markup": {
            "inline_keyboard": [
                [
                    {
                        "text": "✅ В работу",
                        "callback_data": f"content_status:{item_id}:in_work",
                    },
                    {
                        "text": "❌ Мусор",
                        "callback_data": f"content_status:{item_id}:rejected",
                    },
                ],
                [
                    {
                        "text": "🔥 Срочно",
                        "callback_data": f"content_status:{item_id}:urgent",
                    },
                    {
                        "text": "📌 Переснять",
                        "callback_data": f"content_status:{item_id}:remake",
                    },
                    {
                        "text": "✅ Использовано",
                        "callback_data": f"content_status:{item_id}:used",
                    },
                ],
            ]
        },
    }
    response = requests.post(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        json=payload,
        timeout=30,
    )
    response.raise_for_status()


async def collect_channel(
    client: TelegramClient,
    supabase: SupabaseRestClient,
    channel: dict[str, Any],
    keywords: list[Keyword],
    stop_words: list[str],
) -> dict[str, int]:
    channel_ref = channel_entity_ref(channel)
    entity = await client.get_entity(channel_ref)
    last_message_id = int(channel.get("last_message_id") or 0)
    highest_seen_id = last_message_id
    stats = {"seen": 0, "inserted": 0, "sent": 0, "skipped": 0}

    async for message in client.iter_messages(
        entity,
        min_id=last_message_id,
        reverse=True,
    ):
        if not message.id:
            continue

        highest_seen_id = max(highest_seen_id, message.id)
        stats["seen"] += 1

        text = message_text(message)
        media = media_type(message)
        if not text or not media:
            stats["skipped"] += 1
            continue

        if has_stop_word(text, stop_words):
            stats["skipped"] += 1
            continue

        language = channel.get("language") or "ru"
        scoring = score_text(text, keywords, language)
        if scoring.score <= 0:
            stats["skipped"] += 1
            continue

        channel_weight = int(channel.get("weight") or 1)
        score = min(scoring.score + max(channel_weight - 1, 0), 20)
        category = channel.get("category") or scoring.category or "telegram"
        source_url = public_message_url(channel, message.id)
        if not source_url:
            stats["skipped"] += 1
            continue

        item = {
            "source_id": None,
            "source_type": "manual",
            "source_name": channel["title"],
            "source_url": source_url,
            "title": text[:180] or f"Telegram post {message.id}",
            "description": text,
            "thumbnail_url": None,
            "language": language,
            "category": category,
            "score": score,
            "status": "new",
            "published_at": message.date.isoformat() if message.date else None,
            "editor_note": build_editor_note(message, media, scoring.matched_keywords),
        }
        inserted = supabase.insert("content_items", item)

        if not inserted:
            stats["skipped"] += 1
            continue

        stats["inserted"] += 1

        if score >= 10:
            notify_bot(
                inserted["id"],
                channel["title"],
                category,
                score,
                scoring.matched_keywords,
                text,
                source_url,
            )
            stats["sent"] += 1

    if highest_seen_id > last_message_id:
        supabase.patch(
            "telegram_channels",
            {"id": f"eq.{channel['id']}"},
            {"last_message_id": highest_seen_id},
        )

    return stats


async def main() -> None:
    load_environment()

    api_id = int(required_env("TELEGRAM_API_ID"))
    api_hash = required_env("TELEGRAM_API_HASH")
    phone = required_env("TELEGRAM_PHONE")
    session_name = os.getenv("TELEGRAM_SESSION_NAME", "mom_radar")

    supabase = SupabaseRestClient(
        required_env("SUPABASE_URL"),
        required_env("SUPABASE_SERVICE_ROLE_KEY"),
    )
    keywords = load_keywords(supabase)
    stop_words = parse_stop_words()
    channels = supabase.get(
        "telegram_channels",
        {
            "select": "*",
            "enabled": "eq.true",
            "order": "title.asc",
        },
    )

    client = TelegramClient(str(ROOT_DIR / "telegram_collector" / session_name), api_id, api_hash)

    async with client:
        if not await client.is_user_authorized():
            await client.start(phone=phone)

        totals = {"seen": 0, "inserted": 0, "sent": 0, "skipped": 0}
        for channel in channels:
            stats = await collect_channel(client, supabase, channel, keywords, stop_words)
            for key, value in stats.items():
                totals[key] += value
            print(f"{channel['title']}: {stats}")

    print(f"total: {totals}")


if __name__ == "__main__":
    asyncio.run(main())
