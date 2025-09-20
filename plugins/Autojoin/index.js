class AutojoinPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        console.log('[AutojoinPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        // Ищем сообщение о том, что именно НАШ бот зашел на сервер
        if (message.includes(`${this.botInfo.nick} зашел на сервер`)) {
            const joinCommand = this.botInfo.pluginSettings.Autojoin?.serverNumber?.value;
            if (joinCommand) {
                console.log(`[AutojoinPlugin] Бот зашел на сервер, выполняю команду: ${joinCommand}`);
                // Добавляем небольшую задержку, чтобы сервер успел "прогрузить" игрока
                setTimeout(() => {
                    this.botAPI.sendMessage(this.bot, 'cmd', joinCommand);
                }, 2000); // 2 секунды
            }
        }
    }
}

module.exports = AutojoinPlugin;