class ByePlugin {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;
        console.log('[ByePlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        if (message.includes('покинул клан')) {
            // Пытаемся извлечь ник (этот способ не всегда надежен, но он был в вашем коде)
            const parts = message.split(' ');
            const nick = parts.length > 1 ? parts[1] : null;

            if (nick) {
                const byeMessage = this.botInfo.pluginSettings.Bye?.message?.value;
                if (byeMessage) {
                    this.botAPI.sendMessage(this.bot, 'private', byeMessage, nick);
                }
            }
        }
    }
}

module.exports = ByePlugin;