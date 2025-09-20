class FlyPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        console.log('[FlyPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        const text = this.botAPI.getText(message);
        if (text === 'none' || !text.startsWith('@fly')) {
            return;
        }

        const nickName = this.botAPI.getNick(message, json);
        if (nickName === 'none' || nickName === this.botInfo.nick) return;

        // Отправляем команду на выдачу полета
        this.botAPI.sendMessage(this.bot, 'cmd', `/fly ${nickName}`);

        const successMessage = this.botInfo.pluginSettings.Fly?.successMessage?.value || "Флай выдан!";

        // Слушаем ответ от сервера
        const listener = (responseMessage) => {
            const messageText = responseMessage.toString();

            // Сервер подтвердил выдачу
            if (messageText.includes("Установлен режим полета для игрока")) {
                this.bot.removeListener('message', listener);
                setTimeout(() => this.botAPI.sendMessage(this.bot, 'private', successMessage, nickName), 1000);
            }
            // Сервер сообщил о перезарядке команды
            else if (messageText.includes("Эта команда будет доступна через")) {
                this.bot.removeListener('message', listener);
                const cooldownMessage = `Подожди! У меня перезарядка на команду! Попробуй ${messageText.split("доступна ")[1]}`;
                setTimeout(() => this.botAPI.sendMessage(this.bot, 'private', cooldownMessage, nickName), 1000);
            }
        };

        this.bot.on('message', listener);
        setTimeout(() => this.bot.removeListener('message', listener), 5000);
    }
}

module.exports = FlyPlugin;