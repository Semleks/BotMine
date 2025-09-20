class HiPlugin {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;
        console.log('[HiPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        if (message.includes('присоединился к клану.')) {
            const welcomeMessage = this.botInfo.pluginSettings.Hi?.message?.value;
            if (welcomeMessage) {
                this.botAPI.sendMessage(this.bot, 'clan', welcomeMessage);
            }
        }
    }
}

module.exports = HiPlugin;