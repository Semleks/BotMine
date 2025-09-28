const BanStorage = require("../Moderation/BanStorage");

class HiPlugin {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;

        this.bannedUser = BanStorage.bannedUser;
        console.log('[HiPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        if (message.includes('присоеденился к клану.')) {
            if (this.botInfo.activatedPlugins.includes("Moderation")) {
                if (this.bannedUser.has(message.split(' ')[1]))
                {
                    this.botAPI.sendMessage(this.bot, 'clan', `&7[&c&l!&7] &fАвтоматическая защита заблокировала &a${message.split(' ')[1]}&f по причине: &eУже был заблокирован`);
                    setTimeout(() => {
                        this.botAPI.sendMessage(this.bot, 'cmd', '/c kick ' + message.split(' ')[1]);
                    }, 500);
                }
            } 
            
            const welcomeMessage = this.botInfo.pluginSettings.Hi?.message?.value;
            if (welcomeMessage) {
                this.botAPI.sendMessage(this.bot, 'clan', welcomeMessage.replace("{nick}", message.split(' ')[1]));
            }
        }
    }
}

module.exports = HiPlugin;