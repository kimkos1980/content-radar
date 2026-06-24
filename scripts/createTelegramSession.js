const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

(async () => {
  console.log("Создание Telegram session для Content Radar");

  const apiId = Number(await input.text("Введите TELEGRAM_API_ID: "));
  const apiHash = await input.text("Введите TELEGRAM_API_HASH: ");
  const phoneNumber = await input.text("Введите номер телефона аккаунта-репортёра: ");

  const client = new TelegramClient(
    new StringSession(""),
    apiId,
    apiHash,
    {
      connectionRetries: 5,
    }
  );

  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => await input.text("Введите 2FA пароль, если Telegram попросит: "),
    phoneCode: async () => await input.text("Введите код из Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("\nГотово. Скопируй TELEGRAM_SESSION ниже:\n");
  console.log(client.session.save());
  await client.disconnect();
})();
