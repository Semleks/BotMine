class Auth {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        console.log('[Auth] Плагин загружен.');
    }

    onMessage(message, json) {
        if (message.includes('/login')) {
            console.log("[Auth] -> требуется залогинеться. Пробую...");
            const password = this.botInfo.pluginSettings.Auth?.password?.value;
            if (password === undefined || password === "")
            {
                console.warn('Пароль не указан в конфиге. Я не могу залогинеться!');
                return;
            }
            
            this.botAPI.sendMessage(this.bot, 'cmd', '/login ' + password);
        }
        
        if (message.includes('/reg')) {
            console.log("[Auth] -> требуется зарегаться. Пробую...");
            const password = this.botInfo.pluginSettings.Auth?.password?.value;
            if (password === undefined || password === "")
            {
                console.warn('Пароль не указан в конфиге. Я не могу залогинеться!');
                return;
            }

            this.botAPI.sendMessage(this.bot, 'cmd', `/reg ${password} ${password}`); 
        } 
    }
}

module.exports = Auth;