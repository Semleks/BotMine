class MoneyPlugin {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;
        console.log('[MoneyPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        if (message.includes("@money"))
        {
            const type = this.botAPI.getType(message);
            if (type === "global")
                return;
            const settings = this.botInfo.pluginSettings.Money;
            if (!settings.money || !settings.message)
                return;
            const nick = this.botAPI.getNick(message, json);
            this.botAPI.sendMessage(this.bot, "cmd", "/pay " + nick + " " + settings.money.value);
            setTimeout(() => {
                this.botAPI.sendMessage(this.bot, type, settings.message.value.replace("{nick}", nick));
            }, 500);
        }
    }
}

module.exports = MoneyPlugin;