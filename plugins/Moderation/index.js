const BanStorage = require("./BanStorage");
const {set} = require("express/lib/application");

class Moderation {
    constructor(bot, botInfo, botAPI) {
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.bot = bot;

        this.bannedUser = BanStorage.bannedUser;
        this.warnings = new Map();
        this.spamList = new Map();
        console.log('[Moderation] Плагин загружен.');
    }

    onMessage(message, json) {
        const settings = this.botInfo.pluginSettings.Moderation;
        const text = this.botAPI.getText(message);
        if (!text)
            return;

        const nick = this.botAPI.getNick(message, json);
        
        if (!this.bannedUser.has(nick) && this.botAPI.getType(message) === "clan" || this.botAPI.getType(message) === "private") {
            if (!settings.intMessages.value)
            {
                console.warn("В плагине Moderation не указано кол-во сообщений для наказания. Плагин не работает!");
                return;
            }
            
            const now = Date.now();

            if (!this.spamList.has(nick)) {
                this.spamList.set(nick, { lastMsg: text, count: 1, lastTime: now, punished: false });
            } else {
                let spamData = this.spamList.get(nick);

                if (spamData.lastMsg === text && (now - spamData.lastTime) < 3000) {
                    spamData.count++;
                } else {
                    spamData.count = 1;
                }

                spamData.lastMsg = text;
                spamData.lastTime = now;

                if (spamData.count >= settings.intMessages.value) {
                    if (!spamData.punished) {
                        this.botAPI.sendMessage(this.bot, "clan", `&7[&c&l!&7] &fАвтоматическая защита кикнула &a${nick}&f за спам.`);
                        setTimeout(() => {
                            this.botAPI.sendMessage(this.bot, "cmd", "/c kick " + nick);
                        }, 500);
                        spamData.punished = true;
                    } else {
                        this.bannedUser.set(nick, "Спам");
                        this.botAPI.sendMessage(this.bot, "clan", `&7[&c&l!&7] &fАвтоматическая защита заблокировала &a${nick}&f по причине: &eСпам`);
                        setTimeout(() => {
                            this.botAPI.sendMessage(this.bot, "cmd", "/c kick " + nick);
                        }, 500);
                    }
                }

                this.spamList.set(nick, spamData);
            }
        }
        
        if (settings.nick.value === this.botAPI.getNick(message, json)) {
            if (text.startsWith("@list")) {
                let response = "";
                for (const [key, reason] of this.bannedUser) {
                    response += `&c${key}&a за: &e${reason}`;
                }

                if (response === "")
                    response = "&cНет активных блокировок"

                this.botAPI.sendMessage(this.bot, 'clan', response);
                return;
            }

            if (text.startsWith("@ban")) {
                //&7[&c&l!&7] &fАвтоматическая защита временно заблокировала &adan111&f на &c60 минут&f по причине: &eReason
                //&7[&c&l!&7] &fИгрок &adan111&f был забанен модератором&c Top4ikTop&f. Причина: &eНе указана

                const args = text.split(" "); //[0] = @ban, [1] = nick 
                if (args[1] === undefined)
                    return;

                let reason;
                if (args[2] === undefined)
                    reason = "Не указана";
                else
                    reason = message.split('@ban')[1].replace(args[1], "");

                this.bannedUser.set(args[1], reason);
                this.botAPI.sendMessage(this.bot, 'clan', settings.banMessage.value.replace("{reason}", reason).replace("{banned}", args[1]).replace("{moder}", nick));
                setTimeout(() => {
                    this.botAPI.sendMessage(this.bot, 'cmd', '/c kick ' + args[1]);
                }, 500);
                return;
            }

            if (text.startsWith("@unban")) {
                const args = text.split(" "); //[0] = @ban, [1] = nick 
                if (args[1] === undefined)
                    return;
                
                if (!this.bannedUser.has(args[1])) {
                    this.botAPI.sendMessage(this.bot, 'clan', '&cДанный игрок не имеет блокировок.');
                    return;
                } 

                this.bannedUser.delete(args[1]);
                this.botAPI.sendMessage(this.bot, 'clan', `&7[&c&l!&7] &fМодератор&c ${nick}&e снял блокировку&f с игрока &4${args[1]}`);
                return;
            }

            if (text.startsWith("@warn")) {
                const args = text.split(" ");
                
                if (args[1] === undefined)
                    return;

                if (this.warnings.has(args[1])) {
                    let currentWarnings = this.warnings.get(args[1]);
                    currentWarnings++;

                    if (currentWarnings >= 3) {
                        this.bannedUser.set(args[1], "Нет");
                        this.botAPI.sendMessage(this.bot, 'clan', `&7[&c&l!&7] &fАвтоматическая защита заблокировала &a${args[1]}&f по причине: &eДостижение 3-х предупреждений!`);
                        setTimeout(() => {
                            this.botAPI.sendMessage(this.bot, 'cmd', '/c kick ' + args[1]);
                        }, 500);

                        return;
                    }

                    this.warnings.set(args[1], currentWarnings);
                    this.botAPI.sendMessage(this.bot, "clan", `&7[&c&l!&7] &fМодератор &a${nick}&f выдал предупреждение игроку &c${args[1]}&f. Это ${currentWarnings}-ое предупреждение`)
                    return;
                }
                
                this.warnings.set(args[1], 1);
                this.botAPI.sendMessage(this.bot, "clan", `&7[&c&l!&7] &fМодератор &a${nick}&f выдал предупреждение игроку &c${args[1]}&f. &eЭто его 1-ое предупреждение! Будь осторожнее, друг =)`)
                return;
            }

            if (text.startsWith("@unwarn"))
            {
                const args = text.split(" ");

                if (args[1] === undefined)
                    return;

                if (!this.warnings.has(args[1])) {
                    this.botAPI.sendMessage(this.bot, 'clan', '&cДанный игрок не имеет предупреждений.');
                    return;
                }
                
                let currentWarnings = this.warnings.get(args[1]);
                if (currentWarnings === 0) return;
                
                currentWarnings--;
                this.warnings.set(args[1], currentWarnings);
                this.botAPI.sendMessage(this.bot, 'clan', `&7[&c&l!&7] &fМодератор&c ${nick}&e снял предупреждение&f с игрока &4${args[1]}`)
                return;
            }
        }
    }
}

module.exports = Moderation;