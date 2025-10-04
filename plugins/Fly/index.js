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
        const typeChat = this.botAPI.getType(message);
        if (typeChat === 'global') return;
        
        const nickName = this.botAPI.getNick(message, json);
        if (nickName === 'none' || nickName === this.botInfo.nick) return;
        
        this.botAPI.sendMessage(this.bot, 'cmd', `/fly ${nickName}`);

        const successMessage = this.botInfo.pluginSettings.Fly?.successMessage?.value || "Флай выдан!";
        const listener = (responseMessage) => {
            const messageText = responseMessage.toString();
            
            if (messageText.includes("Установлен режим полета включен для")) {
                this.bot.removeListener('message', listener);
                setTimeout(() => this.botAPI.sendMessage(this.bot, typeChat, successMessage, nickName), 1000);
            }
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