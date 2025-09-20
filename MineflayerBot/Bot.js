const Nick = require("./System/GetNickName");
const Send = require("./System/Send");
const Type = require('./System/GetTypeChat');
const Text = require('./System/GetText');
const AI = require('./AI');

let HttpsProxyAgent;
let agent;

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 2081;

const discordMessages = [];

function escapeDiscordMarkdown(text) {
    if (!text) return "";
    return text.replace(/([\\`*_{}\[\]()#+\-.!>])/g, "\\$1");
}

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class Bot {
    constructor() {
        this.getNick = new Nick();
        this.send = new Send();
        this.getType = new Type();
        this.getText = new Text();
        this.ai = new AI();
        this.lastCommitSha = null;
        console.log('[LOG] [Bot.js] Экземпляр класса Bot (обработчик) создан.');
    }

    async checkCommits(bot, owner, repo, branch = "main") {
        try {
            const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Commit-Watcher",
                    "Accept": "application/vnd.github+json",
                },
            });

            if (!response.ok) {
                console.error("[LOG] [GitHub] Ошибка API:", response.status, await response.text());
                return;
            }

            const commits = await response.json();
            if (commits.length === 0) return;

            const latestCommit = commits[0];
            const sha = latestCommit.sha;

            if (this.lastCommitSha && this.lastCommitSha !== sha) {
                const message = latestCommit.commit.message;
                const author = latestCommit.commit.author.name;
                console.log(`[LOG] [GitHub] Новый коммит: ${message} от ${author}`);

                // 💬 Отправляем в чат
                bot.chat(`!Новое обновление BotMine: ${message} от ${author}`);
            }

            this.lastCommitSha = sha;
        } catch (err) {
            console.error("[LOG] [GitHub] Ошибка:", err);
        }
    }

    startCommitWatcher(bot, owner, repo, branch = "main") {
        // запускаем проверку каждые 60 секунд
        setInterval(() => this.checkCommits(bot, owner, repo, branch), 60_000);
        // сразу проверим
        this.checkCommits(bot, owner, repo, branch);
    }

    async MessageHandler(message, bot, botInfo, json) {
        //console.log(`[LOG] [MessageHandler] Начало обработки сообщения: "${message}"`);
        let isRegister = false;
        const text = this.getText.getText(message).trim();
       // console.log(`[LOG] [MessageHandler] Очищенный текст для анализа: "${text}"`);

        if (message.includes("@dev")) {
            console.log('[LOG] [MessageHandler] Обнаружен триггер "@dev".');
            let nick = this.getNick.getNick(message, json);
            let typeChat = this.getType.getType(message);

            if (nick !== "none" && typeChat !== "none") {
                if (typeChat === "global") 
                    this.send.SendMessage('local', 'Этот бот создан с помощью BotMine!', nick, bot);
                else 
                    this.send.SendMessage(typeChat, 'Этот бот создан с помощью BotMine!', nick, bot);
            }
        }

        if (botInfo.activatedPlugins.includes('AiAssistant')) {
         //   console.log('[LOG] [MessageHandler] Плагин "AiAssistant" активен.');
            if (text.startsWith(botInfo.nick) || text.startsWith("бот")) {
                console.log('[LOG] [MessageHandler] Сообщение адресовано боту (ИИ).');
                if (botInfo.pluginSettings.AiAssistant.key.value !== "") {
                    console.log('[LOG] [MessageHandler] Ключ API для ИИ есть, отправляем запрос...');
                    const response = await this.ai.NewQuestion(text, this.getNick.getNick(message, json), botInfo.pluginSettings.AiAssistant.promt.value, botInfo.pluginSettings.AiAssistant.key.value);
                    this.send.SendMessage(this.getType.getType(message), response, this.getNick.getNick(message, json), bot);
                    console.log('[LOG] [MessageHandler] Ответ от ИИ отправлен в чат.');
                } else {
                    console.log('[LOG] [MessageHandler] Ключ API для ИИ не указан, игнорируем.');
                }
            }
        }

        if (botInfo.activatedPlugins.includes('Autojoin')) {
           // console.log('[LOG] [MessageHandler] Плагин "Autojoin" активен.');
            if (message.includes(botInfo.nick + ' зашел на сервер')) {
                console.log('[LOG] [MessageHandler] Обнаружено сообщение о входе на сервер. Отправляем команду для перехода на режим.');
                this.send.SendMessage('cmd', '/surv' + botInfo.pluginSettings.Autojoin.serverNumber.value, '', bot);
            }
        }

        if (botInfo.activatedPlugins.includes('Hi')) {
           // console.log('[LOG] [MessageHandler] Плагин "Hi" активен.');
            if (message.includes('присоеденился к клану.')) {
                console.log('[LOG] [MessageHandler] Обнаружено сообщение о вступлении в клан.');
                this.send.SendMessage('clan', botInfo.pluginSettings.Hi.message.value, '', bot);
            }
        }

        if (botInfo.activatedPlugins.includes('Bye')) {
         //   console.log('[LOG] [MessageHandler] Плагин "Bye" активен.');
            if (message.includes('покинул клан')) {
                console.log('[LOG] [MessageHandler] Обнаружено сообщение о выходе из клана.');
                this.send.SendMessage('private', botInfo.pluginSettings.Bye.message.value, message.split(" ")[1], bot);
            }
        }

        if (botInfo.activatedPlugins.includes('Pinger')) {
          //  console.log('[LOG] [MessageHandler] Плагин "Pinger" активен.');
            if (message.includes(botInfo.nick)) {
                console.log('[LOG] [MessageHandler] В сообщении упомянут ник бота.');
                if (botInfo.pluginSettings.Pinger.token.value !== "" && botInfo.pluginSettings.Pinger.id.value !== "") {
                    const senderNick = this.getNick.getNick(message, json);
                    if (senderNick !== botInfo.nick && senderNick !== "none") {
                        console.log('[LOG] [MessageHandler] Отправляем уведомление в Telegram.');
                        try {
                            const response = await fetch(`https://api.telegram.org/bot${botInfo.pluginSettings.Pinger.token.value}/sendMessage?chat_id=${botInfo.pluginSettings.Pinger.id.value}&text=🔔 Пинг! Сообщение: \n${message}`);
                            const data = await response.json();

                            if (data.ok) {
                                console.log("[LOG] [MessageHandler] Сообщение в Telegram отправлено успешно.");
                            } else {
                                console.error("[LOG] [MessageHandler] Ошибка Telegram:", data);
                            }
                        } catch (err) {
                            console.error("[LOG] [MessageHandler] Ошибка запроса в Telegram:", err);
                        }
                    }
                }
            }
        }

        if (botInfo.activatedPlugins.includes("Invite")) {
           // console.log('[LOG] [MessageHandler] Плагин "Invite" активен.');
            if (text.startsWith("@invite")) {
                console.log("[LOG] [MessageHandler] Обнаружена команда @invite.");
                let typeChat = this.getType.getType(message);
                let nickName = this.getNick.getNick(message, json);
                this.send.SendMessage('cmd', '/clan invite ' + nickName, '', bot);

                const listener = (responseMessage) => {
                    const messageText = responseMessage.toString();
                    console.log(`[LOG] [Invite] Получен ответ от сервера: "${messageText}"`);

                    if (messageText.includes("пригласил")) {
                        bot.removeListener('message', listener);
                        console.log('[LOG] [Invite] Успешное приглашение, отправляем сообщение игроку.');
                        setTimeout(() => this.send.SendMessage(typeChat, botInfo.pluginSettings.Invite.successMessage.value, nickName, bot), 1000);
                    } else if (messageText.includes("уже состоит")) {
                        bot.removeListener('message', listener);
                        console.log('[LOG] [Invite] Игрок уже в клане.');
                        setTimeout(() => this.send.SendMessage(typeChat, `Вы уже состоите в клане! Используй: /clan leave`, nickName, bot), 1000);
                    }
                };
                bot.on('message', listener);
                console.log("[LOG] [Invite] Установлен временный слушатель для ответа на команду.");

                // Тайм-аут на случай, если сервер не ответит
                setTimeout(() => {
                    bot.removeListener('message', listener);
                    console.log('[LOG] [Invite] Тайм-аут ожидания ответа от сервера.');
                }, 5000);
            }
        }

        if (botInfo.activatedPlugins.includes("Fly")) {
          //  console.log('[LOG] [MessageHandler] Плагин "Fly" активен.');
            if (text.startsWith("@fly")) {
                console.log("[LOG] [MessageHandler] Обнаружена команда @fly.");
                let typeChat = this.getType.getType(message);
                let nickName = this.getNick.getNick(message, json);
                this.send.SendMessage('cmd', '/fly ' + nickName, '', bot);

                const listener = (responseMessage) => {
                    const messageText = responseMessage.toString();
                    console.log(`[LOG] [Fly] Получен ответ от сервера: "${messageText}"`);

                    if (messageText.includes("Установлен режим")) {
                        bot.removeListener('message', listener);
                        console.log('[LOG] [Fly] Флай успешно выдан.');
                        setTimeout(() => this.send.SendMessage(typeChat, botInfo.pluginSettings.Fly.successMessage.value, nickName, bot), 1000);
                    } else if (messageText.includes("Эта команда будет доступна")) {
                        bot.removeListener('message', listener);
                        console.log('[LOG] [Fly] Команда на перезарядке.');
                        setTimeout(() => this.send.SendMessage(typeChat, `Подождите! У меня кд на команду! Попробуй через ` + messageText.split("через")[1], nickName, bot), 1000);
                    }
                };
                bot.on('message', listener);
                console.log("[LOG] [Fly] Установлен временный слушатель для ответа на команду.");

                // Тайм-аут
                setTimeout(() => {
                    bot.removeListener('message', listener);
                    console.log('[LOG] [Fly] Тайм-аут ожидания ответа от сервера.');
                }, 5000);
            }
        }

        if (botInfo.activatedPlugins.includes("Synch")) {
            if (botInfo.pluginSettings.Synch.webhook.value !== "") {
                const type = this.getType.getType(message);
                const nick = this.getNick.getNick(message, json);

                if (type !== "none" && nick !== "none" && (type === "local" || type === "global")) {
                //    console.log('[LOG] [MessageHandler] Плагин "Synch" перехватил сообщение для отправки в Discord.');
                    const safeNick = escapeDiscordMarkdown(nick);
                    const safeMessage = escapeDiscordMarkdown(message.split("⇨")[1]);
                    const formattedMessage = `${type}: ${safeNick}: ${safeMessage}`;
                    discordMessages.push(formattedMessage);

                    if (discordMessages.length >= 5) {
                     //   console.log('[LOG] [Synch] Накопилось 5 сообщений, отправляем в Discord.');
                        const messagesToSend = [...discordMessages];
                        discordMessages.length = 0;
                        const payload = {content: messagesToSend.join("\n")};
                        try {
                            await fetch(botInfo.pluginSettings.Synch.webhook.value, {
                                method: "POST",
                                headers: {"Content-Type": "application/json"},
                                body: JSON.stringify(payload),
                                agent: agent,
                                signal: AbortSignal.timeout(30000),
                            });
                        } catch (err) {
                            console.error("[LOG] [Synch] Ошибка отправки в Discord:", err);
                        }
                    }
                }
            }
        }
        
        if (botInfo.activatedPlugins.includes("AntiTp")) 
        {
            if (message.includes('Перемещение на') || message.includes("телепортировал вас к")) {
                if (botInfo.pluginSettings.AntiTp.warp.value !== "") {
                    console.log("Распознал перемещение. Сообщение: " + message);
                    this.send.SendMessage('cmd', botInfo.pluginSettings.AntiTp.warp.value, '', bot);
                }
            }
        }

        if (message.includes('/login')) {
            console.log('[LOG] [MessageHandler] Обнаружено сообщение с "/login".');
            if (botInfo.password === "") {
                console.log('[LOG] [MessageHandler] Пароль не указан, требуется ручной ввод.');
            } else {
                if (isRegister) return;
                console.log('[LOG] [MessageHandler] Автоматически отправляем команду /login с паролем.');
                bot.chat('/login ' + botInfo.password);
                isRegister = true;
            }
        }

        if (message.includes('/reg')) {
            console.log('[LOG] [MessageHandler] Обнаружено сообщение с "/reg".');
            if (botInfo.password === "") {
                console.log('[LOG] [MessageHandler] Пароль не указан, требуется ручной ввод.');
            } else {
                if (isRegister) return;
                console.log('[LOG] [MessageHandler] Автоматически отправляем команду /reg с паролем.');
                bot.chat('/reg ' + botInfo.password + ' ' + botInfo.password);
                isRegister = true;
            }
        }
       // console.log(`[LOG] [MessageHandler] Обработка сообщения "${message}" завершена.`);
    }
}

module.exports = Bot;