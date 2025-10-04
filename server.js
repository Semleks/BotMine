#!/usr/bin/env node

const express = require("express");
const { WebSocketServer } = require("ws");
const mineflayer = require("mineflayer");
const path = require("path");
const fs = require("fs");
const AdmZip = require('adm-zip');

const pluginLoader = require('./plugins/PluginLoader');
const botAPI = require('./MineflayerBot/System/BotAPI');
const commitWatcher = require('./commitWatcher');

const originalJSONParse = JSON.parse;
JSON.parse = function(text, reviver) {
    if (typeof text !== 'string') return originalJSONParse(text, reviver);
    try {
        return originalJSONParse(text, reviver);
    } catch (e) {
        const fixed = text.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        return originalJSONParse(fixed, reviver);
    }
};

const app = express();
const wss = new WebSocketServer({ port: 3001 });

const allBots = {};
const dataFolder = path.join(require('os').homedir(), '.bot-mine');
const botsFolder = path.join(dataFolder, 'bots');
const pluginsRootPath = path.join(__dirname, 'plugins');

if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder, { recursive: true });
if (!fs.existsSync(botsFolder)) fs.mkdirSync(botsFolder, { recursive: true });
if (!fs.existsSync(pluginsRootPath)) fs.mkdirSync(pluginsRootPath, { recursive: true });

function loadAllBots() {
    const files = fs.readdirSync(botsFolder).filter(f => f.endsWith('.json'));

    files.forEach(file => {
        const botId = path.basename(file, '.json');
        const filePath = path.join(botsFolder, file);

        try {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const botData = JSON.parse(rawData);

            for (const pluginName in pluginLoader.availablePlugins) {
                const pluginInfo = pluginLoader.availablePlugins[pluginName];
                if (pluginInfo.defaultSettings && !botData.pluginSettings[pluginName]) {
                    botData.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginInfo.defaultSettings));
                }
            }

            allBots[botId] = {
                data: botData,
                instance: null,
                commitWatcherInstance: null
            };

            console.log(`[LOG] Бот ${botId} загружен из файла.`);
        } catch (err) {
            console.error(`[LOG] Ошибка загрузки бота ${botId}:`, err);
        }
    });
}

function saveBotData(botId) {
    if (!allBots[botId]) return;

    const filePath = path.join(botsFolder, `${botId}.json`);

    try {
        const botData = allBots[botId].data;

        const cleanedPluginSettings = {};
        for (const pluginName in botData.pluginSettings) {
            if (pluginLoader.availablePlugins[pluginName]) {
                cleanedPluginSettings[pluginName] = botData.pluginSettings[pluginName];
            }
        }
        botData.pluginSettings = cleanedPluginSettings;

        fs.writeFileSync(filePath, JSON.stringify(botData, null, 4));
        console.log(`[LOG] Файл ${botId}.json обновлён.`);

        broadcastAllBots();
    } catch (err) {
        console.error(`[LOG] Ошибка записи ${botId}.json:`, err);
    }
}

function deleteBotData(botId) {
    const filePath = path.join(botsFolder, `${botId}.json`);

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[LOG] Файл ${botId}.json удалён.`);
        }

        if (allBots[botId]) {
            if (allBots[botId].instance) {
                allBots[botId].instance.end();
            }
            if (allBots[botId].commitWatcherInstance) {
                commitWatcher.stop(allBots[botId].commitWatcherInstance);
            }
            delete allBots[botId];
        }

        broadcastAllBots();
    } catch (err) {
        console.error(`[LOG] Ошибка удаления ${botId}.json:`, err);
    }
}

function broadcastAllBots() {
    const botsData = {};

    for (const botId in allBots) {
        botsData[botId] = {
            ...allBots[botId].data,
            botIsRunning: allBots[botId].instance !== null
        };
    }

    const message = JSON.stringify({ type: "allBots", data: botsData });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(message);
    });
}

function generateBotId() {
    return `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

loadAllBots();

app.use(express.static(path.join(__dirname, "dist")));

app.get('/export-bot-data', (req, res) => {
    const botId = req.query.botId;

    if (!botId || !allBots[botId]) {
        res.status(404).send('Бот не найден.');
        return;
    }

    const filePath = path.join(botsFolder, `${botId}.json`);

    if (fs.existsSync(filePath)) {
        try {
            res.setHeader('Content-Disposition', `attachment; filename="${allBots[botId].data.nick}.json"`);
            res.setHeader('Content-Type', 'application/json');
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);

            readStream.on('error', (err) => {
                console.error(`[ERROR] Ошибка при чтении файла для экспорта: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).send(`Ошибка сервера: ${err.message}`);
                }
            });

            console.log(`[LOG] Файл ${botId}.json отправлен на экспорт.`);
        } catch (err) {
            console.error(`[ERROR] Ошибка экспорта: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).send(`Ошибка экспорта: ${err.message}`);
            }
        }
    } else {
        res.status(404).send('Файл конфигурации не найден.');
    }
});

app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

wss.on("connection", (ws) => {
    console.log("[LOG] Клиент подключен к WebSocket");

    broadcastAllBots();
    ws.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins }));

    ws.on("message", (msg) => {
        const data = JSON.parse(msg.toString());
        const { type, botId } = data;

        console.log(`[LOG] WebSocket: команда "${type}" для бота ${botId || 'N/A'}`);

        switch (type) {
            case "createBot": {
                if (Object.keys(allBots).length >= 5) {
                    log("status", "Достигнут лимит: максимум 5 ботов.", ws);
                    return;
                }

                const newBotId = generateBotId();
                const newBotData = {
                    nick: data.username,
                    server: data.host,
                    note: (data.note || '').split(' ').slice(0, 10).join(' '),
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

                allBots[newBotId] = {
                    data: newBotData,
                    instance: null,
                    commitWatcherInstance: null
                };

                saveBotData(newBotId);
                log("status", `Бот "${data.username}" создан с ID: ${newBotId}`, ws);
                break;
            }

            case "updateBot": {
                if (!allBots[botId]) {
                    log("status", "Бот не найден.", ws, botId);
                    return;
                }

                allBots[botId].data.nick = data.username;
                allBots[botId].data.server = data.host;
                allBots[botId].data.note = (data.note || '').split(' ').slice(0, 10).join(' ');

                saveBotData(botId);
                log("status", "Данные бота обновлены.", ws, botId);
                break;
            }

            case "deleteBot": {
                if (!allBots[botId]) {
                    log("status", "Бот не найден.", ws, botId);
                    return;
                }

                deleteBotData(botId);
                log("status", "Бот удалён.", ws);
                break;
            }

            case "startBot": {
                if (!allBots[botId]) {
                    log("status", "Бот не найден.", ws, botId);
                    return;
                }

                if (allBots[botId].instance) {
                    log("status", "Перезапускаем бота...", ws, botId);
                    if (allBots[botId].commitWatcherInstance) {
                        commitWatcher.stop(allBots[botId].commitWatcherInstance);
                    }
                    allBots[botId].instance.removeAllListeners();
                    allBots[botId].instance.end();
                    allBots[botId].instance = null;
                }

                const botData = allBots[botId].data;

                if (!botData.server || !botData.nick) {
                    log("status", "Ошибка: Ник или сервер не указаны.", ws, botId);
                    return;
                }

                log("status", `Подключение к ${botData.server} с ником ${botData.nick}...`, ws, botId);

                const bot = mineflayer.createBot({
                    host: botData.server,
                    username: botData.nick,
                    auth: 'offline',
                    version: '1.16.5'
                });

                allBots[botId].instance = bot;
                broadcastAllBots();

                pluginLoader.loadActivePlugins(bot, botData, botAPI);
                allBots[botId].commitWatcherInstance = commitWatcher.start(bot, botData.commitWatcherSettings, botAPI);

                bot.on('spawn', (spawnEvent) => {
                    Object.values(pluginLoader.loadedPlugins).forEach(pluginInstance => {
                        if (pluginInstance.onSpawn) {
                            try {
                                pluginInstance.onSpawn(spawnEvent);
                            } catch (e) {
                                console.error(`[SERVER] Ошибка в onSpawn:`, e);
                            }
                        }
                    });
                });

                bot.on('message', (jsonMsg) => {
                    const text = jsonMsg.toString();

                    if (text.trim() === "") return;

                    let html = jsonMsg.toHTML();

                    html = html.replace(/§([0-9a-fk-or])/gi, (match, code) => {
                        const colors = {
                            '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
                            '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
                            '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
                            'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
                            'l': '</span><span style="font-weight:bold">',
                            'r': '</span><span>'
                        };
                        return colors[code.toLowerCase()]
                            ? `</span><span style="color:${colors[code.toLowerCase()]}">`
                            : '';
                    });

                    html = html.replace(/^&gt;/, '');
                    html = `<span>${html}</span>`;

                    const messageData = JSON.stringify({ type: "chat", botId, message: html });

                    wss.clients.forEach(client => {
                        if (client.readyState === client.OPEN) {
                            client.send(messageData);
                        }
                    });

                    Object.values(pluginLoader.loadedPlugins).forEach(pluginInstance => {
                        if (pluginInstance.onMessage) {
                            try {
                                pluginInstance.onMessage(text, jsonMsg);
                            } catch (e) {
                                console.error(`[SERVER] Ошибка в onMessage:`, e);
                            }
                        }
                    });
                });

                bot.on('playerJoined', (player) => {
                    Object.values(pluginLoader.loadedPlugins).forEach(pluginInstance => {
                        if (pluginInstance.onPlayerJoined) {
                            try {
                                pluginInstance.onPlayerJoined(player);
                            } catch (e) {
                                console.error(`[SERVER] Ошибка в onPlayerJoined:`, e);
                            }
                        }
                    });
                });

                bot.on('end', (reason) => {
                    log("status", "Соединение завершено. Причина: " + reason, ws, botId);
                    if (allBots[botId].commitWatcherInstance) {
                        commitWatcher.stop(allBots[botId].commitWatcherInstance);
                    }
                    allBots[botId].instance = null;
                    broadcastAllBots();
                });

                bot.on('error', (err) => {
                    log("status", "Ошибка подключения: " + err.message, ws, botId);
                    if (allBots[botId].commitWatcherInstance) {
                        commitWatcher.stop(allBots[botId].commitWatcherInstance);
                    }
                    allBots[botId].instance = null;
                    broadcastAllBots();
                });

                bot.on('kicked', (reason) => {
                    if (!reason.includes("Игрок с таким ником уже онлайн")) {
                        log("status", "Кикнут с сервера: " + reason, ws, botId);
                        if (allBots[botId].commitWatcherInstance) {
                            commitWatcher.stop(allBots[botId].commitWatcherInstance);
                        }
                        allBots[botId].instance = null;
                        broadcastAllBots();
                    }
                });

                break;
            }

            case "stopBot": {
                if (!allBots[botId] || !allBots[botId].instance) {
                    log("status", "Бот не запущен.", ws, botId);
                    return;
                }

                log("status", "Выключаю бота...", ws, botId);
                if (allBots[botId].commitWatcherInstance) {
                    commitWatcher.stop(allBots[botId].commitWatcherInstance);
                }
                allBots[botId].instance.removeAllListeners();
                allBots[botId].instance.end();
                allBots[botId].instance = null;
                broadcastAllBots();
                break;
            }

            case "sendMessage": {
                if (!allBots[botId] || !allBots[botId].instance) {
                    log("status", "Не могу отправить сообщение, бот не запущен.", ws, botId);
                    return;
                }

                allBots[botId].instance.chat(data.message);
                log("status", "Сообщение отправлено: " + data.message, ws, botId);
                break;
            }

            case "togglePlugin": {
                if (!allBots[botId]) {
                    log("status", "Бот не найден.", ws, botId);
                    return;
                }

                const { pluginName } = data;
                const botData = allBots[botId].data;
                const pluginIndex = botData.activatedPlugins.indexOf(pluginName);

                if (pluginIndex > -1) {
                    botData.activatedPlugins.splice(pluginIndex, 1);
                    pluginLoader.unloadPlugin(pluginName);
                    log("status", `Плагин "${pluginName}" отключен.`, ws, botId);
                } else {
                    if (!pluginLoader.availablePlugins[pluginName]) {
                        log("status", `Ошибка: Плагин "${pluginName}" не найден.`, ws, botId);
                        return;
                    }
                    botData.activatedPlugins.push(pluginName);
                    const pluginInfo = pluginLoader.availablePlugins[pluginName];
                    if (pluginInfo && pluginInfo.defaultSettings && !botData.pluginSettings[pluginName]) {
                        botData.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginInfo.defaultSettings));
                    }
                    log("status", `Плагин "${pluginName}" включен.`, ws, botId);
                }
                saveBotData(botId);
                if (allBots[botId].instance) {
                    log("status", "Для применения изменений перезапустите бота.", ws, botId);
                }
                break;
            }

            case "savePluginSettings": {
                if (!allBots[botId]) {
                    log("status", "Бот не найден.", ws, botId);
                    return;
                }

                const { pluginName, settings } = data;
                const botData = allBots[botId].data;

                if (!botData.pluginSettings[pluginName]) {
                    botData.pluginSettings[pluginName] = {};
                }
                for (const key in settings) {
                    if (botData.pluginSettings[pluginName][key]) {
                        botData.pluginSettings[pluginName][key].value = settings[key];
                    } else {
                        botData.pluginSettings[pluginName][key] = {
                            label: key,
                            value: settings[key]
                        };
                    }
                }
                log("status", `Настройки для плагина "${pluginName}" сохранены.`, ws, botId);
                saveBotData(botId);
                break;
            }

            case "importBotData": {
                const { content } = data;
                try {
                    const importedData = JSON.parse(content);
                    if (typeof importedData.nick !== 'string' || typeof importedData.server !== 'string') {
                        throw new Error("Некорректный формат файла.");
                    }

                    if (Object.keys(allBots).length >= 5) {
                        log("status", "Достигнут лимит: максимум 5 ботов.", ws);
                        return;
                    }

                    const newBotId = generateBotId();
                    const newBotData = {
                        nick: importedData.nick || "",
                        server: importedData.server || "",
                        note: importedData.note || "",
                        activatedPlugins: Array.isArray(importedData.activatedPlugins) ? importedData.activatedPlugins : [],
                        pluginSettings: typeof importedData.pluginSettings === 'object' ? importedData.pluginSettings : {},
                        commitWatcherSettings: typeof importedData.commitWatcherSettings === 'object' ? importedData.commitWatcherSettings : {
                            owner: "Semleks",
                            repo: "Botmine",
                            branch: "main",
                            interval: 1,
                            chatMessage: "!Новое обновление BotMine: {message} от {author}"
                        }
                    };

                    for (const pluginName of newBotData.activatedPlugins) {
                        if (pluginLoader.availablePlugins[pluginName] && pluginLoader.availablePlugins[pluginName].defaultSettings && !newBotData.pluginSettings[pluginName]) {
                            newBotData.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginLoader.availablePlugins[pluginName].defaultSettings));
                        }
                    }

                    allBots[newBotId] = {
                        data: newBotData,
                        instance: null,
                        commitWatcherInstance: null
                    };

                    saveBotData(newBotId);
                    log("status", `Бот "${newBotData.nick}" успешно импортирован.`, ws);
                } catch (error) {
                    log("status", `Ошибка импорта: ${error.message}`, ws);
                    console.error("[LOG] Ошибка импорта:", error);
                }
                break;
            }

            case "uploadPluginZip": {
                const { fileName, content } = data;
                try {
                    const zipBuffer = Buffer.from(content, 'base64');
                    const zip = new AdmZip(zipBuffer);
                    const zipEntries = zip.getEntries();

                    let manifestEntry = null;
                    let indexJsEntry = null;

                    for (const entry of zipEntries) {
                        if (entry.entryName === 'manifest.json') {
                            manifestEntry = entry;
                        }
                        if (entry.entryName === 'index.js') {
                            indexJsEntry = entry;
                        }
                    }

                    if (!manifestEntry || !indexJsEntry) {
                        log("pluginUploadStatus", "Ошибка: Отсутствует manifest.json или index.js в корне архива.", ws, null, false);
                        return;
                    }

                    let parsedManifest;
                    try {
                        const manifestContent = manifestEntry.getData().toString('utf8');
                        parsedManifest = JSON.parse(manifestContent);
                    } catch (e) {
                        log("pluginUploadStatus", `Ошибка: manifest.json содержит некорректный JSON.`, ws, null, false);
                        return;
                    }

                    if (!parsedManifest.name || typeof parsedManifest.name !== 'string' || parsedManifest.name.trim() === '') {
                        log("pluginUploadStatus", "Ошибка: В manifest.json отсутствует поле 'name'.", ws, null, false);
                        return;
                    }
                    if (!parsedManifest.description || typeof parsedManifest.description !== 'string') {
                        log("pluginUploadStatus", "Ошибка: В manifest.json отсутствует поле 'description'.", ws, null, false);
                        return;
                    }

                    const indexJsContent = indexJsEntry.getData().toString('utf8');
                    const onMessageRegex = /onMessage\s*\((\s*message\s*,\s*json\s*)?\)|\bonMessage\s*:\s*function\s*\(/;
                    if (!onMessageRegex.test(indexJsContent)) {
                        log("pluginUploadStatus", "Ошибка: В index.js не найден метод 'onMessage'.", ws, null, false);
                        return;
                    }

                    let pluginDirName = parsedManifest.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    if (pluginDirName.length === 0) {
                        pluginDirName = `plugin_${Date.now()}`;
                    }
                    const targetPluginPath = path.join(pluginsRootPath, pluginDirName);

                    if (fs.existsSync(targetPluginPath)) {
                        fs.rmSync(targetPluginPath, { recursive: true, force: true });
                    }

                    zip.extractAllTo(targetPluginPath, true);
                    log("pluginUploadStatus", `Плагин "${parsedManifest.name}" успешно установлен.`, ws, null, true);
                    console.log(`[LOG] Плагин "${pluginDirName}" установлен.`);

                    pluginLoader.loadPluginsFromDisk();
                    wss.clients.forEach(c => {
                        if(c.readyState === c.OPEN)
                            c.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins }))
                    });
                } catch (error) {
                    log("pluginUploadStatus", `Ошибка при установке плагина: ${error.message}`, ws, null, false);
                    console.error("[LOG] Ошибка при установке плагина:", error);
                }
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

function log(type, message, ws, botId = null, isSuccess = true, additionalData = {}) {
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type, botId, success: isSuccess, message, ...additionalData }));
    }
}