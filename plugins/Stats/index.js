class StatsPlugin {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;
        
        this.dateStart = new Date.now();
        this.newMembers = 0;
        this.leavedMembers = 0;
        console.log('[StatsPlugin] Плагин загружен.');
    }

    onMessage(message, json) {
        console.log(message);
        if (message.includes('присоеденился к клану.')) {
            this.newMembers++;
            console.log('Новый участник клана!');
        }
        
        if (message.includes('покинул клан')) {
            this.leavedMembers--;
            console.log("Нас покинул игрок...")
        }
        
        if (message.includes("@stats")) {
            console.log('Stats command..')
            const nick = this.botAPI.getNick(message, json);
            const type = this.botAPI.getType(message);
            const config = this.botInfo.pluginSettings.stats;
            if (!config.adminNick.value)
                return;
            
            if (config.adminNick.value !== nick) {
                this.botAPI.sendMessage(this.bot, type, "Нет прав для выполнения команды - stats", nick);
            } 
            
            this.botAPI.sendMessage(this.bot, type, `&aПришло людей: ${this.newMembers}&c Вышло: ${this.leavedMembers}&e. Чистая прибыль :) ${this.newMembers - this.leavedMembers}&7 Дата начала статистики: ${this.dateStart}`, nick)
        }
    }
}

module.exports = StatsPlugin;