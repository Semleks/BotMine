class MoneyPlugin {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;

        // здесь будем хранить ник → timestamp последнего использования
        this.coolDown = new Map();
        console.log('[MoneyPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        if (message.includes("@money")) {
            const type = this.botAPI.getType(message);
            if (type === "global") return;

            const settings = this.botInfo.pluginSettings.Money;
            if (!settings.money || !settings.message || !settings.kd) return;

            const nick = this.botAPI.getNick(message, json);

            const now = Date.now();
            const cdMinutes = parseInt(settings.kd.value); // кд в минутах
            const cdMs = cdMinutes * 60 * 1000;

            const lastUsed = this.coolDown.get(nick) || 0;

            if (now - lastUsed >= cdMs) {
                this.coolDown.set(nick, now);
                
                this.botAPI.sendMessage(this.bot, "cmd", `/pay ${nick} ${settings.money.value}`);

                setTimeout(() => {
                    this.botAPI.sendMessage(this.bot, type, settings.message.value.replace("{nick}", nick));
                }, 500);
            } else {
                const remaining = Math.ceil((cdMs - (now - lastUsed)) / 1000 / 60);
                this.botAPI.sendMessage(
                    this.bot,
                    type,
                    settings.kdMessage.value.replace("{kd}", remaining + " минут")
                );
            }
        }
    }
}

module.exports = MoneyPlugin;
