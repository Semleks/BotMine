#!/usr/bin/env node

const express = require("express");
const { WebSocketServer } = require("ws");
const mineflayer = require("mineflayer");
const path = require("path");
const fs = require("fs");

// Подключаем наши новые модули
const pluginLoader = require('./plugins/PluginLoader');
const botAPI = require('./MineflayerBot/System/BotAPI');
const commitWatcher = require('./commitWatcher');

// Структура данных для хранения информации о боте
let myBot = {
    nick: "",
    password: "",
    server: "",
    activatedPlugins: [],
    pluginSettings: {},
    commitWatcherSettings: {
        owner: "Semleks",
        repo: "Botmine",
        branch: "main",
        interval: 1,
        chatMessage: "!Новое обновление BotMine: {message} от {author}"
    }
};

const app = express();
const wss = new WebSocketServer({ port: 3001 });
let bot = null; // Глобальная переменная для экземпляра бота

const username = process.env.USERNAME || process.env.USER;
const filePath = path.join('C:\\Users', username, 'Botmine', 'main.json');
const dir = path.dirname(filePath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function loadBotData() {
    if (fs.existsSync(filePath)) {
        try {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const jsonData = rawData ? JSON.parse(rawData) : {};
            myBot = { ...myBot, ...jsonData };
            console.log('[LOG] Конфигурация бота загружена.');
        } catch (err) {
            console.error("[LOG] Ошибка чтения/парсинга main.json:", err);
        }
    }
}

function saveBotData() {
    try {
        fs.writeFileSync(filePath, JSON.stringify(myBot, null, 4));
        console.log('[LOG] Файл main.json обновлен.');
        // Уведомляем всех клиентов об изменениях
        const updatedData = JSON.stringify({ type: "botInfo", data: myBot });
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) client.send(updatedData);
        });
    } catch (err) {
        console.error("[LOG] Ошибка записи в main.json:", err);
    }
}

// Загружаем данные при старте сервера
loadBotData();

app.use(express.static(path.join(__dirname, "dist")));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

wss.on("connection", (ws) => {
    console.log("[LOG] Клиент подключен к WebSocket");

    // При подключении отправляем клиенту текущую конфигурацию бота и список всех доступных плагинов
    ws.send(JSON.stringify({ type: "botInfo", data: myBot }));
    ws.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins }));

    ws.on("message", (msg) => {
        const data = JSON.parse(msg.toString());
        console.log(`[LOG] WebSocket: получена команда "${data.type}"`);

        switch (data.type) {
            case "savePluginSettings": {
                const { pluginName, settings } = data;
                if (myBot.pluginSettings[pluginName]) {
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

            case "togglePlugin": {
                const { pluginName } = data;
                const pluginIndex = myBot.activatedPlugins.indexOf(pluginName);

                if (pluginIndex > -1) { // Отключаем
                    myBot.activatedPlugins.splice(pluginIndex, 1);
                    pluginLoader.unloadPlugin(pluginName); // Выгружаем экземпляр
                    log("status", `Плагин "${pluginName}" отключен.`, ws);
                } else { // Включаем
                    myBot.activatedPlugins.push(pluginName);
                    const pluginInfo = pluginLoader.availablePlugins[pluginName];
                    if (pluginInfo && pluginInfo.defaultSettings && !myBot.pluginSettings[pluginName]) {
                        myBot.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginInfo.defaultSettings));
                    }
                    log("status", `Плагин "${pluginName}" включен.`, ws);
                }
                saveBotData();
                // Если бот запущен, нужно перезапустить его, чтобы подхватить изменения
                if (bot) {
                    log("status", "Для применения изменений перезапустите бота.", ws);
                }
                break;
            }

            case "stopBot": {
                if (bot) {
                    log("status", "Выключаю бота...", ws);
                    commitWatcher.stop();
                    bot.end();
                    bot = null;
                } else {
                    log("status", "Бот и так не запущен.", ws);
                }
                break;
            }

            case "startBot": {
                if (bot) {
                    log("status", "Перезапускаем бота...", ws);
                    commitWatcher.stop();
                    bot.end();
                }
                if (!myBot.server || !myBot.nick) {
                    log("status", "Ошибка: Ник или сервер не указаны.", ws);
                    return;
                }

                log("status", `Подключение к ${myBot.server} с ником ${myBot.nick}...`, ws);
                bot = mineflayer.createBot({
                    host: myBot.server,
                    username: myBot.nick,
                    auth: 'offline', // Или 'microsoft'
                    version: '1.16.5'
                });

                // Инициализируем все активные плагины
                pluginLoader.loadActivePlugins(bot, myBot, botAPI);

                commitWatcher.start(bot, myBot.commitWatcherSettings, botAPI);

                // Центральный обработчик сообщений
                bot.on('message', (jsonMsg) => {
                    const text = jsonMsg.toString();
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ type: "chat", message: text }));
                    }
                    // Передаем сообщение каждому активному плагину
                    Object.values(pluginLoader.loadedPlugins).forEach(pluginInstance => {
                        if (pluginInstance.onMessage) {
                            try {
                                pluginInstance.onMessage(text, jsonMsg);
                            } catch (e) {
                                console.error(`[SERVER] Ошибка в onMessage плагина ${pluginInstance.constructor.name}:`, e);
                            }
                        }
                    });
                });

                bot.on('end', (reason) => {
                    log("status", "Соединение завершено. Причина: " + reason, ws);
                    commitWatcher.stop();
                    bot = null;
                });
                bot.on('error', (err) => log("status", "Ошибка подключения: " + err.message, ws));
                bot.on('kicked', (reason) => log("status", "Кикнут с сервера: " + reason, ws));

                break;
            }

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
                if (bot) bot.end();
                myBot.nick = data.username;
                myBot.password = data.password;
                myBot.server = data.host;
                log("status", "Данные бота сохранены. Запускаем...", ws);
                saveBotData();
                // Автоматический запуск
                ws.emit('message', JSON.stringify({ type: 'startBot' }));
                break;
            }
        }
    });

    ws.on('close', () => console.log('[LOG] Клиент WebSocket отключился'));
});

app.listen(3000, () => {
    console.log("HTTP сервер запущен на http://localhost:3000");
    console.log("WebSocket сервер слушает порт 3001");
});

function log(type, message, ws) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type, message }));
    }
}