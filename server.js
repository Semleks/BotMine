const express = require("express");
const { WebSocketServer } = require("ws");
const mineflayer = require("mineflayer");
const path = require("path");
const fs = require("fs");
const Bot = require("./MineflayerBot/Bot");

// Структура данных для хранения информации о боте
let myBot = {
    nick: "",
    password: "",
    server: "",
    activatedPlugins: [],
    pluginSettings: {} // Объект для хранения настроек плагинов
}

const app = express();
const wss = new WebSocketServer({ port: 3001 });
let bot = null; // Глобальная переменная для экземпляра бота

// Определение пути к файлу конфигурации
const username = process.env.USERNAME || process.env.USER; // Для совместимости с Windows/Linux
const filePath = path.join('C:\\Users', username, 'Botmine', 'main.json');

// Настройка статического сервера для обслуживания фронтенда
app.use(express.static(path.join(__dirname, "dist")));
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startPeriodicMessages(bot) {
    console.log('>>> [Таймер] Запущена отправка периодических сообщений.');
    const TWO_MINUTES = 2 * 60 * 1000;

    while (true) {
        await delay(TWO_MINUTES);

        try {
            if (myBot.pluginSettings.Messages.message.value !== "") 
               bot.chat("!" + myBot.pluginSettings.Messages.message.value);
        } catch (e) {
            console.error('>>> Ошибка при отправке периодического сообщения:', e);
        }
    }
}

// Создание директории, если она не существует
const dir = path.dirname(filePath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Определяем настройки по умолчанию для каждого плагина.
// Это позволяет автоматически создавать структуру настроек при активации плагина.
const defaultPluginSettings = {
    "Autojoin": {
        "serverNumber": { "label": "Номер режима для входа", "value": "" }
    },
    "Hi": {
      "message": {"label": "Введите сообщение", "value": "Привет, botmine!"}  
    },
    "Bye": {
      "message": {"label": "Введите сообщение", "value": "Пока!"}  
    },
    "Pinger": {
        "token": {"label": "Введите токен бота (@botfather)", "value": ""},
        "id": {"label": "Введите ID группы", "value": ""}
    },
    "Invite": {
        "successMessage": {"label": "Сообщения, после успешного приглашения в клан.", "value": "Отправил! Прими приглашение в клан."}
    },
    "Fly": {
        "successMessage": {"label": "Сообщения, после успешной выдачи флая.", "value": "Успешно установил вам режим полета! Удачи!"}
    },
    "Messages": {
        "message": {"label": "Введите рекламное сообщение.", "value": ""}
    }
};

function loadBotData() {
    if (fs.existsSync(filePath)) {
        try {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            if (rawData) {
                const jsonData = JSON.parse(rawData);
                console.log('Содержимое main.json загружено:', jsonData);

                myBot.nick = jsonData.nick || "";
                myBot.password = jsonData.password || "";
                myBot.server = jsonData.server || "";
                myBot.activatedPlugins = Array.isArray(jsonData.activatedPlugins) ? jsonData.activatedPlugins : [];
                myBot.pluginSettings = jsonData.pluginSettings || {};
            } else {
                console.log("Файл main.json пуст.");
            }
        } catch (err) {
            console.error("Ошибка чтения или парсинга main.json:", err);
        }
    } else {
        console.log("Файл main.json не найден. Он будет создан автоматически.");
    }
}

function saveBotData() {
    try {
        fs.writeFileSync(filePath, JSON.stringify(myBot, null, 4));
        console.log('Файл main.json обновлен.');
        
        const updatedData = JSON.stringify({ type: "botInfo", data: myBot });
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.send(updatedData);
            }
        });
    } catch (err) {
        console.error("Ошибка записи в main.json:", err);
    }
}

// Загружаем данные при старте сервера
loadBotData();

// --- Логика WebSocket сервера ---
wss.on("connection", (ws) => {
    console.log("Клиент подключен к WebSocket");

    const minecraftBot = new Bot(); 
    
    ws.send(JSON.stringify({
        type: "botInfo",
        data: myBot
    }));

    ws.on("message", (msg) => {
        const data = JSON.parse(msg.toString());

        switch (data.type) {
            // Сохранение настроек плагина
            case "savePluginSettings": {
                const { pluginName, settings } = data;
                if (myBot.pluginSettings[pluginName]) {
                    // Обновляем значения настроек
                    for (const key in settings) {
                        if (myBot.pluginSettings[pluginName][key]) {
                            myBot.pluginSettings[pluginName][key].value = settings[key];
                        }
                    }
                    log("status", `Настройки для плагина "${pluginName}" сохранены.`, ws);
                    saveBotData();
                }
                break;
            }

            // Включение/отключение плагина
            case "togglePlugin": {
                const { pluginName } = data;
                const pluginIndex = myBot.activatedPlugins.indexOf(pluginName);

                if (pluginIndex > -1) { // Если плагин был активен -> отключаем
                    myBot.activatedPlugins.splice(pluginIndex, 1);
                    log("status", `Плагин "${pluginName}" удален.`, ws);
                } else { // Если плагин не был активен -> включаем
                    myBot.activatedPlugins.push(pluginName);
                    // Если у плагина есть настройки по умолчанию и их еще нет в конфиге, добавляем их
                    if (defaultPluginSettings[pluginName] && !myBot.pluginSettings[pluginName]) {
                        myBot.pluginSettings[pluginName] = JSON.parse(JSON.stringify(defaultPluginSettings[pluginName]));
                    }
                    log("status", `Плагин "${pluginName}" загружен.`, ws);
                }
                saveBotData();
                break;
            }

            // Остановка бота
            case "stopBot": {
                if (bot) {
                    log("status", "Выключаю бота...", ws);
                    bot.end();
                    bot = null;
                } else {
                    log("status", "Бот и так не запущен.", ws);
                }
                break;
            }

            // Запуск бота
            case "startBot": {
                if (bot) { // Если бот уже запущен, перезапускаем его
                    bot.end();
                    bot = null;
                }

                if (!myBot.server || !myBot.nick) {
                    log("status", "Ошибка: Ник или сервер не указаны. Создайте бота.", ws);
                    return;
                }

                log("status", `Подключение к серверу ${myBot.server} с ником ${myBot.nick}...`, ws);

                bot = mineflayer.createBot({
                    host: myBot.server,
                    username: myBot.nick,
                    auth: 'offline',
                    version: '1.16.5'
                });
                
                startPeriodicMessages(bot)

                // Обработчики событий Mineflayer
                bot.once('spawn', () => {
                    log("status", "Бот успешно заспавнился в мире.", ws);
                });

                bot.on('end', (reason) => {
                    log("status", "Соединение завершено. Причина: " + reason, ws);
                    bot = null;
                });

                bot.on('error', (err) => {
                    log("status", ">>> Ошибка подключения: " + err.message, ws);
                    console.error("Mineflayer error:", err);
                });

                bot.on('kicked', (reason) => {
                    log("status", "Кикнут с сервера: " + reason, ws);
                });

                bot.on('message', (jsonMsg) => {
                    const text = jsonMsg.toString().trim();
                    
                    if (text) {
                        // Отправляем сообщение из чата игры в веб-интерфейс
                        ws.send(JSON.stringify({ type: "chat", message: text }));
                        
                        minecraftBot.MessageHandler(text, bot, myBot, jsonMsg);
                    }
                });
                break;
            }

            // Отправка сообщения в игровой чат
            case "sendMessage": {
                if (bot && bot.entity) {
                    bot.chat(data.message);
                    log("status", "Сообщение отправлено: " + data.message, ws);
                } else {
                    log("status", "Не могу отправить сообщение, бот не запущен.", ws);
                }
                break;
            }
            
            case "createBot": {
                if (bot) {
                    bot.end();
                    bot = null;
                }
                
                myBot.nick = data.username;
                myBot.password = data.password;
                myBot.server = data.host;

                log("status", "Данные бота сохранены. Запускаем...", ws);
                saveBotData();
                
                // Автоматически запускаем бота с новыми данными
                // Чтобы не дублировать код, можно отправить "внутреннее" сообщение startBot
                ws.emit('message', JSON.stringify({type: 'startBot'}));
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Клиент отключился');
    });
});

// Запуск HTTP сервера
app.listen(3000, () => {
    console.log("HTTP сервер запущен на http://localhost:3000");
    console.log("WebSocket сервер слушает порт 3001");
});

function log(type, message, ws) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: type, message: message }));
    }
}