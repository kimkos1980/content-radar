import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getKeywords() {
  return [
    { word: "видео", weight: 1 },
    { word: "камера", weight: 1 },
    { word: "полиция", weight: 1 },
    { word: "мама", weight: 1 },
    { word: "родители", weight: 1 },

    { word: "ребенок", weight: 2 },
    { word: "ребёнок", weight: 2 },
    { word: "дети", weight: 2 },
    { word: "школа", weight: 2 },
    { word: "детсад", weight: 2 },
    { word: "садик", weight: 2 },
    { word: "конфликт", weight: 2 },

    { word: "жесть", weight: 3 },
    { word: "драка", weight: 3 },
    { word: "скандал", weight: 3 },

    { word: "school", weight: 1 },
    { word: "video", weight: 1 },
    { word: "child", weight: 2 },
    { word: "kids", weight: 2 },
    { word: "mother", weight: 2 },
    { word: "viral", weight: 3 },
    { word: "caught on camera", weight: 3 },
  ];
}

function scoreText(text) {
  const normalized = String(text || "").toLowerCase();
  const matched = [];
  let score = 0;

  for (const item of getKeywords()) {
    if (normalized.includes(item.word.toLowerCase())) {
      matched.push(item.word);
      score += item.weight;
    }
  }

  return { score, matched };
}

function getMessageText(message) {
  return [
    message.message,
    message.text,
    message.caption,
  ]
    .filter(Boolean)
    .join("\n");
}

async function getSourceName(message) {
  try {
    const chat = await message.getChat();
    return chat?.title || chat?.username || "unknown";
  } catch {
    return "unknown";
  }
}

async function sendFallback(client, targetChat, message, sourceName, matched, score) {
  const text = getMessageText(message).slice(0, 2500);

  const fallback = [
    "⚠️ Найден пост, но оригинал не удалось переслать",
    "",
    `Источник: ${sourceName || "неизвестно"}`,
    `Score: ${score}`,
    `Ключи: ${matched.join(", ")}`,
    "",
    "Текст:",
    text || "без текста",
  ].join("\n");

  await client.sendMessage(targetChat, { message: fallback });
}

loadEnvLocal();

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const reporterSession = process.env.TELEGRAM_REPORTER_SESSION;
const targetChat = process.env.TELEGRAM_TARGET_CHAT || process.env.TELEGRAM_CHAT_ID;

const SCORE_THRESHOLD = 3;

if (!apiId || !apiHash) {
  console.error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env.local");
  process.exit(1);
}

if (!reporterSession) {
  console.error("Missing TELEGRAM_REPORTER_SESSION in .env.local. Run npm run telegram:login first.");
  process.exit(1);
}

if (!targetChat) {
  console.error("Missing TELEGRAM_TARGET_CHAT or TELEGRAM_CHAT_ID in .env.local");
  process.exit(1);
}

process.on("unhandledRejection", (error) => {
  const message = error?.message || String(error);

  if (message.includes("TIMEOUT")) {
    console.warn("[WARN] Telegram timeout. Worker will continue or reconnect.");
    return;
  }

  console.error("[UNHANDLED REJECTION]", error);
});

async function startReporter() {
  const client = new TelegramClient(new StringSession(reporterSession), apiId, apiHash, {
    connectionRetries: 10,
    useWSS: false,
  });

  await client.connect();

  console.log("Telegram Reporter connected.");
  console.log(`Target chat: ${targetChat}`);
  console.log("Listening for new Telegram posts...");
  console.log("");

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;

      if (!message) {
        return;
      }

      if (message.isPrivate) {
        return;
      }

      const text = getMessageText(message);
      const { score, matched } = scoreText(text);

      if (score < SCORE_THRESHOLD) {
        return;
      }

      const sourceName = await getSourceName(message);

      console.log(`[MATCH] ${sourceName} | score=${score} | keys=${matched.join(", ")}`);

      try {
        await client.forwardMessages(targetChat, {
          messages: [message.id],
          fromPeer: message.peerId,
        });

        await client.sendMessage(targetChat, {
          message: `👆 Найдено Репортёром\nИсточник: ${sourceName}\nScore: ${score}\nКлючи: ${matched.join(", ")}`,
        });
      } catch (forwardError) {
        console.error("Forward failed, sending fallback:", forwardError?.message || forwardError);
        await sendFallback(client, targetChat, message, sourceName, matched, score);
      }
    } catch (error) {
      console.error("Handler error:", error);
    }
  }, new NewMessage({}));

  return client;
}

let client = null;

while (true) {
  try {
    client = await startReporter();

    while (true) {
      await sleep(60_000);
      console.log(`[alive] ${new Date().toLocaleString()}`);
    }
  } catch (error) {
    console.error("Reporter crashed:", error?.message || error);

    try {
      if (client) {
        await client.disconnect();
      }
    } catch {}

    console.log("Restarting reporter in 10 seconds...");
    await sleep(10_000);
  }
}