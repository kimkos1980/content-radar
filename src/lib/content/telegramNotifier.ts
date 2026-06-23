import "server-only";
import type { ContentItem, ContentItemStatus } from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org";

const statusButtons: Array<{ label: string; status: ContentItemStatus }> = [
  { label: "✅ В работу", status: "in_work" },
  { label: "❌ Мусор", status: "rejected" },
  { label: "🔥 Срочно", status: "urgent" },
  { label: "📌 Переснять", status: "remake" },
  { label: "✅ Использовано", status: "used" }
];

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildTelegramMessage(item: ContentItem) {
  return [
    "🔥 <b>Новая находка</b>",
    "",
    "<b>Источник:</b>",
    `${escapeHtml(item.source_type)} / ${escapeHtml(item.source_name)}`,
    "",
    "<b>Категория:</b>",
    escapeHtml(item.category ?? "не определена"),
    "",
    "<b>Оценка:</b>",
    `${item.score}/20`,
    "",
    "<b>Название:</b>",
    escapeHtml(item.title),
    "",
    "<b>Ссылка:</b>",
    escapeHtml(item.source_url),
    "",
    "<b>Описание:</b>",
    escapeHtml(item.description ?? "")
  ].join("\n");
}

export function buildTelegramInlineKeyboard(itemId: string) {
  return {
    inline_keyboard: [
      statusButtons.slice(0, 2).map((button) => ({
        text: button.label,
        callback_data: `content_status:${itemId}:${button.status}`
      })),
      statusButtons.slice(2).map((button) => ({
        text: button.label,
        callback_data: `content_status:${itemId}:${button.status}`
      }))
    ]
  };
}

async function telegramRequest<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram ${method} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

export async function notifyTelegram(item: ContentItem) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!chatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID");
  }

  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text: buildTelegramMessage(item),
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: buildTelegramInlineKeyboard(item.id)
  });
}

export async function answerTelegramCallback(callbackQueryId: string, text: string) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text
  });
}
