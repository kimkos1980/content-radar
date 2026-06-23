import { NextResponse } from "next/server";
import { saveManualContentItem } from "@/lib/content/contentCollector";
import { answerTelegramCallback } from "@/lib/content/telegramNotifier";
import { isContentStatus } from "@/lib/content/statuses";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      chat?: {
        id?: number | string;
      };
    };
  };
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
  };
};

const urlPattern = /https?:\/\/[^\s<>"']+/gi;

function chatMatchesConfigured(chatId: number | string | undefined) {
  const configuredChatId = process.env.TELEGRAM_CHAT_ID;

  if (!configuredChatId) {
    return false;
  }

  return String(chatId) === configuredChatId;
}

async function handleCallback(update: TelegramUpdate) {
  const callback = update.callback_query;

  if (!callback?.id || !callback.data) {
    return;
  }

  if (!chatMatchesConfigured(callback.message?.chat?.id)) {
    await answerTelegramCallback(callback.id, "Нет доступа");
    return;
  }

  const [prefix, itemId, status] = callback.data.split(":");

  if (prefix !== "content_status" || !itemId || !status || !isContentStatus(status)) {
    await answerTelegramCallback(callback.id, "Неизвестная команда");
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("content_items")
    .update({ status })
    .eq("id", itemId);

  if (error) {
    throw error;
  }

  await answerTelegramCallback(callback.id, "Статус обновлён");
}

async function handleManualMessage(update: TelegramUpdate) {
  const message = update.message;

  if (!message?.text || !chatMatchesConfigured(message.chat?.id)) {
    return;
  }

  const links = message.text.match(urlPattern) ?? [];

  for (const link of links) {
    await saveManualContentItem(link);
  }
}

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;

  if (update.callback_query) {
    await handleCallback(update);
  }

  if (update.message) {
    await handleManualMessage(update);
  }

  return NextResponse.json({ ok: true });
}
