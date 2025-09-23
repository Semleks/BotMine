const https = require('https');

class TelegramLog {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;
        console.log('[TelegramLog] Плагин загружен.');
    }

    onMessage(message, json) {
        const settings = this.botInfo.pluginSettings.TelegramLog;
        if (!settings || !settings.botToken || !settings.chatId || !settings.topicId) {
            console.log('[TelegramLog] Настройки плагина не заданы. Сообщения не будут отправляться.');
            return;
        }
        
        const type = this.botAPI.getType(message);
        const nick = this.botAPI.getNick(message, json);
        
        if (type === "none" || nick === "none") 
            return;

        const chatText = this.botInfo.pluginSettings.TelegramLog.message.value.replace("{nick}", nick).
        replace("{type}", type).
        replace("{message}", this.botAPI.getText(message));

        const botToken = settings.botToken.value;
        const chatId = settings.chatId.value;
        const topicId = settings.topicId.value;

        const encodedText = encodeURIComponent(chatText);
        const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&message_thread_id=${topicId}&text=${encodedText}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const response = JSON.parse(data);
                if (!response.ok) {
                    console.error('[TelegramLog] Ошибка при отправке сообщения в Telegram:', response.description);
                }
            });
        }).on('error', (err) => {
            console.error('[TelegramLog] Ошибка HTTP-запроса:', err.message);
        });
    }
}

module.exports = TelegramLog;