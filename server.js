#!/usr/bin/env node

process.on('uncaughtException', (err) => {
    // Проверяем, что это именно та ошибка, которую мы ожидаем:
    // 1. Это SyntaxError.
    // 2. В стеке вызовов упоминается mineflayer (это делает проверку надежнее).
    // 3. Сообщение содержит "JSON", что указывает на ошибку парсинга.
    if (err instanceof SyntaxError && err.stack.includes('mineflayer') && err.message.includes('JSON')) {

        // Выводим в консоль предупреждение, чтобы было понятно, что произошло
        console.warn('--- [Botmine] Перехвачена ошибка парсинга скина игрока. ---');
        console.warn('Это известная проблема при работе с некоторыми серверами (например, с SkinRestorer).');
        console.warn('Ошибка безопасно проигнорирована. Бот продолжает работу.');

    } else {
        // Если это любая ДРУГАЯ непредвиденная ошибка, мы не хотим ее игнорировать.
        // Это может привести к нестабильной работе. Поэтому мы выводим ошибку
        // и завершаем работу, как это сделал бы Node.js по умолчанию.
        console.error('--- [Botmine] Произошла критическая неперехваченная ошибка! ---');
        console.error(err);
        process.exit(1); // Выход с кодом ошибки
    }
});

const express = require("express");
const {WebSocketServer} = require("ws");
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
const wss = new WebSocketServer({port: 3001});
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
    console.log('[LOG] >>> [Таймер] Запущена отправка периодических сообщений.');
    const TWO_MINUTES = 2 * 60 * 1000;

    while (true) {
        await delay(TWO_MINUTES);
        if (!bot) { // Если бота остановили, прекращаем цикл
            console.log('[LOG] >>> [Таймер] Бот остановлен, периодические сообщения прекращены.');
            break;
        }
        try {
            if (myBot.pluginSettings.Messages && myBot.pluginSettings.Messages.message.value !== "") {
                console.log('[LOG] >>> [Таймер] Отправляю периодическое сообщение.');
                bot.chat("!" + myBot.pluginSettings.Messages.message.value);
            }
        } catch (e) {
            console.error('[LOG] >>> Ошибка при отправке периодического сообщения:', e);
        }
    }
}

// Создание директории, если она не существует
const dir = path.dirname(filePath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
}

// Определяем настройки по умолчанию для каждого плагина.
// Это позволяет автоматически создавать структуру настроек при активации плагина.
const defaultPluginSettings = {
    "Autojoin": {
        "serverNumber": {"label": "Номер режима для входа", "value": ""}
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
        "successMessage": {
            "label": "Сообщения, после успешного приглашения в клан.",
            "value": "Отправил! Прими приглашение в клан."
        }
    },
    "Fly": {
        "successMessage": {
            "label": "Сообщения, после успешной выдачи флая.",
            "value": "Успешно установил вам режим полета! Удачи!"
        }
    },
    "Messages": {
        "message": {"label": "Введите рекламное сообщение.", "value": ""}
    },
    "Synch": {
        "webhook": {"label": "Введите вебхук из дс.", "value": ""}
    },
    "AiAssistant": {
        "key": {"label": "Введите API ключ (gemini)", "value": ""},
        "promt": {"label": "Введите промт для Нейросети", "value": "Привет! Ты - игрок майнкрафта. Постарайся ответить на вопрос игрока с юмором. Не используй эмодзи и стикеры! Ответь ОЧЕНЬ КРАТКО. Максимум - 60 слов. Не используй перенос на новую строку!"}
    },
    "AntiTp": {
        "warp": {"label": "Команда, которую бот пропишет при перемещении", "value": ""}
    }
};

function loadBotData() {
    console.log('[LOG] Загрузка данных бота из файла...');
    if (fs.existsSync(filePath)) {
        try {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            if (rawData) {
                const jsonData = JSON.parse(rawData);
                console.log('[LOG] Содержимое main.json успешно загружено:', jsonData);

                myBot.nick = jsonData.nick || "";
                myBot.password = jsonData.password || "";
                myBot.server = jsonData.server || "";
                myBot.activatedPlugins = Array.isArray(jsonData.activatedPlugins) ? jsonData.activatedPlugins : [];
                myBot.pluginSettings = jsonData.pluginSettings || {};
            } else {
                console.log("[LOG] Файл main.json пуст.");
            }
        } catch (err) {
            console.error("[LOG] Ошибка чтения или парсинга main.json:", err);
        }
    } else {
        console.log("[LOG] Файл main.json не найден. Он будет создан автоматически.");
    }
}

function saveBotData() {
    try {
        fs.writeFileSync(filePath, JSON.stringify(myBot, null, 4));
        console.log('[LOG] Файл main.json обновлен.');

        const updatedData = JSON.stringify({type: "botInfo", data: myBot});
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.send(updatedData);
            }
        });
    } catch (err) {
        console.error("[LOG] Ошибка записи в main.json:", err);
    }
}

// Загружаем данные при старте сервера
loadBotData();

// --- Логика WebSocket сервера ---
wss.on("connection", (ws) => {
    console.log("[LOG] Клиент подключен к WebSocket");

    const minecraftBot = new Bot();

    ws.send(JSON.stringify({
        type: "botInfo",
        data: myBot
    }));

    ws.on("message", (msg) => {
        const data = JSON.parse(msg.toString());
        console.log(`[LOG] Получено сообщение от клиента WebSocket: тип "${data.type}"`);

        switch (data.type) {
            // Сохранение настроек плагина
            case "savePluginSettings": {
                const {pluginName, settings} = data;
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
                const {pluginName} = data;
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
                    console.log("[LOG] Получена команда на остановку бота. Вызываем bot.end()");
                    bot.end();
                    bot = null;
                } else {
                    log("status", "Бот и так не запущен.", ws);
                    console.log("[LOG] Получена команда на остановку, но бот не был запущен.");
                }
                break;
            }

            // Запуск бота
            case "startBot": {
                if (bot) {
                    log("status", "Бот уже запущен, перезапускаем...", ws);
                    console.log("[LOG] Перезапуск бота: сначала останавливаем старый экземпляр.");
                    bot.end(); // bot.end() вызовет событие 'end'
                    bot = null;
                }

                minecraftBot.startCommitWatcher(bot, "Semleks", "Botmine", "main");

                if (!myBot.server || !myBot.nick) {
                    log("status", "Ошибка: Ник или сервер не указаны. Создайте бота.", ws);
                    console.error("[LOG] Ошибка запуска: ник или сервер не указаны.");
                    return;
                }

                log("status", `Подключение к серверу ${myBot.server} с ником ${myBot.nick}...`, ws);
                console.log(`[LOG] Создание нового экземпляра бота mineflayer. Хост: ${myBot.server}, Ник: ${myBot.nick}`);

                bot = mineflayer.createBot({
                    host: myBot.server,
                    username: myBot.nick,
                    auth: 'offline',
                    version: '1.16.5'
                });

                console.log('[LOG] Экземпляр бота создан. Начинаем установку обработчиков событий.');

                // Обработчик события 'spawn' - ключевой для переподключения к чату
                bot.on('spawn', () => {
                    log("status", "Событие SPAWN: бот заспавнился в мире.", ws);
                    console.log("=====================================================");
                    console.log("[LOG] [EVENT] ---> 'spawn' <--- Бот заспавнился. Мир может быть новым.");
                    console.log("[LOG] Переустанавливаем обработчик сообщений, чтобы точно их получать.");

                    // Сначала удаляем ВСЕ предыдущие слушатели 'message', чтобы избежать дублей

                    // Теперь добавляем единственный, свежий слушатель
                    console.log("[LOG] Новый слушатель 'message' успешно установлен.");
                    console.log("=====================================================");
                });

                bot.on('message', (jsonMsg) => {
                    const text = jsonMsg.toString();
                   // console.log(`[LOG] [EVENT] 'message': Получено сообщение из чата: "${text}"`);

                    if (text) {
                        // Отправляем сообщение из чата игры в веб-интерфейс
                        ws.send(JSON.stringify({type: "chat", message: text}));
                        minecraftBot.MessageHandler(text, bot, myBot, jsonMsg);
                    }
                });

                bot.on('end', (reason) => {
                    log("status", "Соединение завершено. Причина: " + reason, ws);
                    console.log(`[LOG] [EVENT] 'end'. Причина: ${reason}. Устанавливаем bot = null.`);
                    bot = null;
                });

                bot.on('error', (err) => {
                    log("status", ">>> Ошибка подключения: " + err.message, ws);
                    console.error("[LOG] [EVENT] 'error':", err);
                });

                bot.on('kicked', (reason) => {
                    log("status", "Кикнут с сервера: " + reason, ws);
                    console.log(`[LOG] [EVENT] 'kicked'. Причина: ${reason}`);
                });

                // Запускаем периодические сообщения только после создания бота
                startPeriodicMessages(bot);
                break;
            }

            // Отправка сообщения в игровой чат
            case "sendMessage": {
                if (bot && bot.entity) {
                    console.log(`[LOG] Отправка сообщения в чат от пользователя: "${data.message}"`);
                    bot.chat(data.message);
                    log("status", "Сообщение отправлено: " + data.message, ws);
                } else {
                    console.log("[LOG] Не могу отправить сообщение, бот не запущен или не в мире.");
                    log("status", "Не могу отправить сообщение, бот не запущен.", ws);
                }
                break;
            }

            case "createBot": {
                if (bot) {
                    console.log("[LOG] Создание нового бота: останавливаем старый экземпляр.");
                    bot.end();
                    bot = null;
                }

                myBot.nick = data.username;
                myBot.password = data.password;
                myBot.server = data.host;

                log("status", "Данные бота сохранены. Запускаем...", ws);
                console.log("[LOG] Данные бота обновлены. Nick:", myBot.nick, "Server:", myBot.server);
                saveBotData();

                // Автоматически запускаем бота с новыми данными
                console.log("[LOG] Автоматический запуск бота после создания.");
                ws.emit('message', JSON.stringify({type: 'startBot'}));
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('[LOG] Клиент WebSocket отключился');
    });
});

// Запуск HTTP сервера
app.listen(3000, () => {
    console.log("HTTP сервер запущен на http://localhost:3000");
    console.log("WebSocket сервер слушает порт 3001");
});

function log(type, message, ws) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({type: type, message: message}));
    }
}