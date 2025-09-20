const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class SynchPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.messageBuffer = []; // Буфер для сообщений
        this.isSending = false;
        console.log('[SynchPlugin] Плагин загружен.');
    }

    // Метод для безопасного форматирования текста для Discord
    escapeDiscordMarkdown(text) {
        if (!text) return "";
        return text.replace(/([\\`*_{}[\]()#+\-.!>])/g, "\\$1");
    }

    async onMessage(message, json) {
        const webhookUrl = this.botInfo.pluginSettings.Synch?.webhook?.value;
        if (!webhookUrl) return; // Если вебхук не указан, ничего не делаем

        const type = this.botAPI.getType(message);
        const nick = this.botAPI.getNick(message, json);
        const text = this.botAPI.getText(message);

        // Собираем только глобальные и локальные сообщения от реальных игроков
        if (nick !== 'none' && text !== 'none' && (type === 'local' || type === 'global')) {
            const safeNick = this.escapeDiscordMarkdown(nick);
            const safeMessage = this.escapeDiscordMarkdown(text);

            this.messageBuffer.push(`**[${type.charAt(0).toUpperCase()}] ${safeNick}**: ${safeMessage}`);

            if (this.messageBuffer.length >= 5 && !this.isSending) {
                await this.sendBuffer();
            }
        }
    }

    // Отправляет накопленные сообщения
    async sendBuffer() {
        if (this.messageBuffer.length === 0) return;
        this.isSending = true;

        const messagesToSend = [...this.messageBuffer];
        this.messageBuffer.length = 0; // Очищаем буфер

        const payload = {
            content: messagesToSend.join('\n')
        };

        try {
            const webhookUrl = this.botInfo.pluginSettings.Synch?.webhook?.value;
            await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error("[SynchPlugin] Ошибка отправки в Discord:", err);
            // Возвращаем сообщения в буфер, если отправка не удалась
            this.messageBuffer.unshift(...messagesToSend);
        } finally {
            this.isSending = false;
        }
    }

    // Этот метод будет вызван, когда плагин отключают или бот останавливается
    // Он гарантирует, что последние сообщения не потеряются
    async onUnload() {
        console.log('[SynchPlugin] Выгрузка плагина, отправка оставшихся сообщений...');
        await this.sendBuffer();
    }
}

module.exports = SynchPlugin;