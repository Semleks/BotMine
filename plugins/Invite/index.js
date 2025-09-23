class InvitePlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        console.log('[InvitePlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        const text = this.botAPI.getText(message);
        if (message.includes('подал заявку на вступление в ваш клан.')) //| Игрок NICK подал заявку на вступление в ваш клан.
        {
            console.log(message);
            this.botAPI.sendMessage(this.bot, 'cmd', '/c accept ' + message.split(' ')[2])
            return;
        }
        if (text === 'none' || !text.startsWith('@invite')) {
            return;
        }

        const nickName = this.botAPI.getNick(message, json);
        if (nickName === 'none' || nickName === this.botInfo.nick) return;

        // Отправляем команду приглашения
        this.botAPI.sendMessage(this.bot, 'cmd', `/clan invite ${nickName}`);

        // Получаем текст для ответа из настроек плагина
        const successMessage = this.botInfo.pluginSettings.Invite?.successMessage?.value || "Пригласил!";

        // Временно слушаем чат, чтобы поймать ответ сервера
        const listener = (responseMessage) => {
            const messageText = responseMessage.toString();

            if (messageText.includes("пригласил")) {
                this.bot.removeListener('message', listener);
                // Отправляем игроку сообщение об успехе
                setTimeout(() => this.botAPI.sendMessage(this.bot, 'private', successMessage, nickName), 1000);
            } else if (messageText.includes("уже состоит")) {
                this.bot.removeListener('message', listener);
                setTimeout(() => this.botAPI.sendMessage(this.bot, 'private', `Этот игрок уже в клане!`, nickName), 1000);
            }
        };

        this.bot.on('message', listener);

        // Убираем слушатель через 5 секунд, если ответа не было
        setTimeout(() => this.bot.removeListener('message', listener), 5000);
    }
}

module.exports = InvitePlugin;