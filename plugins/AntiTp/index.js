class AntiTpPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        console.log('[AntiTpPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        // Ищем в сообщении ключевые фразы, указывающие на телепортацию
        if (message.includes('Перемещение на') || message.includes("телепортировал вас к")) {
            const commandToExecute = this.botInfo.pluginSettings.AntiTp?.command?.value;

            if (commandToExecute) {
                console.log(`[AntiTpPlugin] Обнаружена телепортация. Выполняю команду: ${commandToExecute}`);
                // Добавляем небольшую задержку, чтобы команда выполнилась уже после телепортации
                setTimeout(() => {
                    this.botAPI.sendMessage(this.bot, 'cmd', commandToExecute);
                }, 1000); // 1 секунда
            }
        }
    }
}

module.exports = AntiTpPlugin;