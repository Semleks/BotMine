const Nick = require("./System/GetNickName");
const Send = require("./System/Send");
const Type = require('./System/GetTypeChat');
const Text = require('./System/GetText');

let fetch;
let HttpsProxyAgent;
let agent;

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 2081;

const discordMessages = [];

function escapeDiscordMarkdown(text) {
    if (!text) return "";
    return text.replace(/([\\`*_{}\[\]()#+\-.!>])/g, "\\$1");
}

async function ensureFetch() {
    if (!fetch) {
        const nodeFetchModule = await import("node-fetch");
        fetch = nodeFetchModule.default;

        const httpsProxyAgentModule = await import("https-proxy-agent");
        HttpsProxyAgent = httpsProxyAgentModule.HttpsProxyAgent;

        agent = new HttpsProxyAgent(`http://${PROXY_HOST}:${PROXY_PORT}`);
    }
}

class Bot {
    constructor() {
        this.getNick = new Nick();
        this.send = new Send();
        this.getType = new Type();
        this.getText = new Text();
    }
    
    async MessageHandler(message, bot, botInfo, json) {
        let isRegister = false;
        const text = this.getText.getText(message).trim();

        if (botInfo.activatedPlugins.includes('Autojoin')) {
            if (message.includes(botInfo.nick + ' зашел на сервер')) {
                this.send.SendMessage('cmd', '/surv' + botInfo.pluginSettings.Autojoin.serverNumber.value, '', bot);
            }
        }

        if (botInfo.activatedPlugins.includes('Hi')) {
            if (message.includes('присоеденился к клану.')) {
                this.send.SendMessage('clan', botInfo.pluginSettings.Hi.message.value, '', bot);
            }
        }

        if (botInfo.activatedPlugins.includes('Bye')) {
            if (message.includes('покинул клан')) {
                this.send.SendMessage('private', botInfo.pluginSettings.Bye.message.value, message.split(" ")[1], bot);
            }
        }

        if (botInfo.activatedPlugins.includes('Pinger')) {
            if (message.includes(botInfo.nick)) {
                if (botInfo.pluginSettings.Pinger.token.value !== "" && botInfo.pluginSettings.Pinger.id.value !== "") {
                    await fetch(`https://api.telegram.org/bot${botInfo.pluginSettings.Pinger.token.value}/sendMessage?chat_id=${botInfo.pluginSettings.Pinger.id.value}&text=Пинг! Сообщение: ${message}`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.ok) {
                                console.log("Сообщение отправлено:", data.result.text);
                            } else {
                                console.error("Ошибка Telegram:", data);
                            }
                        })
                        .catch(err => console.error("Ошибка запроса:", err));
                }
            }
        }

        if (botInfo.activatedPlugins.includes("Invite")) {
            if (text.startsWith("@invite")) {
                console.log("Yes.")
                let typeChat = this.getType.getType(message);
                let nickName = this.getNick.getNick(message, json);
                this.send.SendMessage('cmd', '/clan invite ' + nickName, '', bot);
                try {
                    console.log(">>> [InviteCommand] Жду ответа от сервера (тайм-аут 5 секунд)...");

                    const messagePromise = new Promise((resolve) => {
                        const listener = (message) => {
                            const messageText = message.toString();

                            // Проверяем, содержит ли ответ ключевые слова
                            if (messageText.includes("пригласил")) {
                                bot.removeListener('message', listener); // Убираем слушателя, чтобы он не сработал снова
                                setTimeout(() => {
                                    this.send.SendMessage(typeChat, botInfo.pluginSettings.Invite.successMessage.value, nickName, bot);
                                }, 1000)
                            } else if (messageText.includes("уже состоит")) {
                                bot.removeListener('message', listener);
                                setTimeout(() => {
                                    this.send.SendMessage(typeChat, `Вы уже состоите в клане! Используй: /clan leave`, nickName, bot);
                                }, 1000)
                            }
                        };
                        bot.on('message', listener);
                    });

                } catch (error) {
                    // Эта часть сработает, если победил тайм-аут
                    console.error(`>>> [FlyCommand] Ошибка: ${error.message}`);
                    this.send.SendMessage('private', 'Сервер не ответил на команду. Попробуйте позже.', nickName, bot);
                }
            }
        }
        if (botInfo.activatedPlugins.includes("Fly")) {
            if (text.startsWith("@fly")) {
                let typeChat = this.getType.getType(message);
                let nickName = this.getNick.getNick(message, json);
                this.send.SendMessage('cmd', '/fly ' + nickName, '', bot);

                try {
                    console.log(">>> [FlyCommand] Жду ответа от сервера (тайм-аут 5 секунд)...");

                    // Создаем промис, который будет ждать нужного сообщения
                    const messagePromise = new Promise((resolve) => {
                        const listener = (message) => {
                            const messageText = message.toString();

                            // Проверяем, содержит ли ответ ключевые слова
                            if (messageText.includes("Установлен режим")) {
                                bot.removeListener('message', listener); // Убираем слушателя, чтобы он не сработал снова
                                setTimeout(() => {
                                    this.send.SendMessage(this.getType.getType(message), botInfo.pluginSettings.Fly.successMessage.value, nickName, bot);
                                }, 1000)
                            } else if (messageText.includes("Эта команда будет доступна")) {
                                bot.removeListener('message', listener);
                                setTimeout(() => {
                                    this.send.SendMessage(this.getType.getType(message), `Подождите! У меня кд на команду! Попробуй через ` + messageText.split("через")[1], nickName, bot);
                                }, 1000)
                            }
                        };
                        bot.on('message', listener);
                    });

                } catch (error) {
                    // Эта часть сработает, если победил тайм-аут
                    console.error(`>>> [FlyCommand] Ошибка: ${error.message}`);
                    this.send.SendMessage('private', 'Сервер не ответил на команду. Попробуйте позже.', nick, bot);
                }
            }
        }

        if (botInfo.activatedPlugins.includes("Synch")) {
            if (botInfo.pluginSettings.Synch.webhook.value !== "") {
                const type = this.getType.getType(message);
                const nick = this.getNick.getNick(message, json);

                //console.log(nick, type);

                if (type === "none" || nick === "none") return;
                if (type !== "local" && type !== "global") return;

                const safeNick = escapeDiscordMarkdown(nick);
                const safeMessage = escapeDiscordMarkdown(message.split("⇨")[1]);

                const formattedMessage = `${type}: ${safeNick}: ${safeMessage}`;
                discordMessages.push(formattedMessage);

                if (discordMessages.length >= 5) {
                    const messagesToSend = [...discordMessages];
                    discordMessages.length = 0;

                    const payload = {content: messagesToSend.join("\n")};

                    try {
                        fetch(botInfo.pluginSettings.Synch.webhook.value, {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify(payload),
                            agent: agent,
                            signal: AbortSignal.timeout(30000),
                        });
                    } catch (err) {

                    }
                }
            }
        }

        if (message.includes('/login')) {
            if (botInfo.password === "") {
                console.log('У вас не указан логин! Введите его вручную!')
            } else {
                if (isRegister)
                    return;

                bot.chat('/login ' + botInfo.password);
                isRegister = true;
            }
        }

        if (message.includes('/reg')) {
            if (botInfo.password === "") {
                console.log('У вас не указан логин! Введите его вручную!')
            } else {
                if (isRegister)
                    return;
                bot.chat('/reg ' + botInfo.password + ' ' + botInfo.password);
                isRegister = true;
            }
        }
    }
}

module.exports = Bot;