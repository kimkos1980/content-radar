import { NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const cronHeader = request.headers.get("x-vercel-cron");
  const secret = process.env.CONTENT_COLLECT_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronHeader === "1") {
    return true;
  }

  if (secret && authHeader === `Bearer ${secret}`) {
    return true;
  }

  return false;
}

function getTelegramEnv() {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION;

  if (!apiId || !apiHash || !session) {
    throw new Error("Missing TELEGRAM_API_ID, TELEGRAM_API_HASH or TELEGRAM_SESSION");
  }

  return {
    apiId: Number(apiId),
    apiHash,
    session,
  };
}

function getMessageText(message: any) {
  if (!message) {
    return "";
  }

  if (typeof message.message === "string") {
    return message.message;
  }

  if (typeof message.text === "string") {
    return message.text;
  }

  return "";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors: string[] = [];
  let channelsChecked = 0;
  let messagesChecked = 0;

  const samples: Array<{
    channelTitle: string;
    messageId: number | string;
    text: string;
  }> = [];

  let client: TelegramClient | null = null;

  try {
    const { apiId, apiHash, session } = getTelegramEnv();

    client = new TelegramClient(
      new StringSession(session),
      apiId,
      apiHash,
      {
        connectionRetries: 3,
      }
    );

    await client.connect();

    const dialogs = client.iterDialogs({});

    for await (const dialog of dialogs) {
      const entity: any = dialog.entity;

      const isChannelLike =
        Boolean(dialog.isChannel) ||
        Boolean(dialog.isGroup) ||
        entity?.className === "Channel";

      if (!isChannelLike || !entity) {
        continue;
      }

      channelsChecked += 1;

      try {
        const messages = client.iterMessages(entity, { limit: 20 });

        for await (const message of messages) {
          messagesChecked += 1;

          const text = getMessageText(message).trim();

          if (text && samples.length < 10) {
            samples.push({
              channelTitle: dialog.title || "Telegram channel",
              messageId: message.id,
              text: text.slice(0, 300),
            });
          }
        }
      } catch (error) {
        errors.push(
          `Channel read error: ${dialog.title || "unknown"} — ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    await client.disconnect();

    return NextResponse.json({
      ok: true,
      channelsChecked,
      messagesChecked,
      samples,
      errors,
    });
  } catch (error) {
    console.error("Telegram user collector failed:", error);

    try {
      await client?.disconnect();
    } catch {}

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        channelsChecked,
        messagesChecked,
        samples,
        errors,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed. Use POST.",
    },
    { status: 405 }
  );
}