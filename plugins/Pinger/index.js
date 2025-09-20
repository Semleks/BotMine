const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class PingerPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        console.log('[PingerPlugin] Плагин загружен.');
    }

    async onMessage(message, json) {
        // Проверяем, содержит ли сообщение ник нашего бота (без учета регистра)
        if (message.toLowerCase().includes(this.botInfo.nick.toLowerCase())) {

            const senderNick = this.botAPI.getNick(message, json);
            // Не реагируем на собственные сообщения
            if (senderNick === 'none' || senderNick === this.botInfo.nick) return;

            const token = this.botInfo.pluginSettings.Pinger?.token?.value;
            const chatId = this.botInfo.pluginSettings.Pinger?.id?.value;

            if (!token || !chatId) {
                return; // Не отправляем, если настройки не заданы
            }

            console.log(`[PingerPlugin] Обнаружено упоминание от ${senderNick}. Отправка в Telegram...`);

            // Форматируем текст для отправки
            const telegramText = `🔔 Пинг от игрока *${senderNick}*!\n\nСообщение:\n\`\`\`\n${message}\n\`\`\``;
            const url = `https://api.telegram.org/bot${token}/sendMessage`;

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: telegramText,
                        parse_mode: 'Markdown'
                    })
                });
                const data = await response.json();
                if (!data.ok) {
                    console.error("[PingerPlugin] Ошибка от API Telegram:", data.description);
                }
            } catch (err) {
                console.error("[PingerPlugin] Ошибка при отправке запроса в Telegram:", err);
            }
        }
    }
}

module.exports = PingerPlugin;