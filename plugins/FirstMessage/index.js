const {settings} = require("express/lib/application");

class FirstMessage {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;
        
        this.cout = 0;
        console.log('[ByePlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        
    }
    
    onSpawn(event)
    {
        const message = this.botInfo.pluginSettings.FirstMessage?.message.value;
        
        if (!message)
            return;
        
        this.cout++;
        
        if (this.cout !== 1)
            return;
        
        setTimeout(() => {
            this.botAPI.sendMessage(this.bot, 'clan', message);
        }, 5000);
    }
}

module.exports = FirstMessage;