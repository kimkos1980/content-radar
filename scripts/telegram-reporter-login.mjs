import { createRequire } from "node:module";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

process.on("unhandledRejection", (error) => {
  const message = error?.message || String(error);

  if (message.includes("TIMEOUT")) {
    console.warn("[WARN] Telegram timeout after login/disconnect. Ignore if session was printed.");
    return;
  }

  console.error("[UNHANDLED REJECTION]", error);
});

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

loadEnvLocal();

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  console.error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env.local");
  process.exit(1);
}

const rl = readline.createInterface({ input, output });

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 10,
  useWSS: false,
});

try {
  await client.start({
    phoneNumber: async () => await rl.question("Phone number: "),
    password: async () => await rl.question("2FA password, if enabled: "),
    phoneCode: async () => await rl.question("Telegram code: "),
    onError: (err) => console.error(err),
  });

  const session = client.session.save();

  console.log("");
  console.log("Reporter connected.");
  console.log("");
  console.log("Copy this line to .env.local:");
  console.log("");
  console.log(`TELEGRAM_REPORTER_SESSION=${session}`);
  console.log("");
} catch (error) {
  console.error("Login failed:", error?.message || error);
} finally {
  rl.close();

  try {
    await client.disconnect();
  } catch {}
}