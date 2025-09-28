#!/usr/bin/env node

const express = require("express");
const { WebSocketServer } = require("ws");
const mineflayer = require("mineflayer");
const os = require('os');
const path = require("path");
const fs = require("fs");
const axios = require('axios');
const AdmZip = require('adm-zip');

const pluginLoader = require('./plugins/PluginLoader');
const botAPI = require('./MineflayerBot/System/BotAPI');
const commitWatcher = require('./commitWatcher');

const originalJSONParse = JSON.parse
JSON.parse = function(text, reviver) {
    if (typeof text !== 'string') return originalJSONParse(text, reviver)
    try {
        return originalJSONParse(text, reviver)
    } catch (e) {
        const fixed = text.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        return originalJSONParse(fixed, reviver)
    }
}

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
let bot = null;

const dataFolder = path.join(os.homedir(), '.bot-mine');
const filePath = path.join(dataFolder, 'main.json');
const pluginsRootPath = path.join(__dirname, 'plugins');
const dir = path.dirname(filePath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(pluginsRootPath)) fs.mkdirSync(pluginsRootPath, { recursive: true });

function loadBotData() {
    if (fs.existsSync(filePath)) {
        try {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const jsonData = rawData.trim() ? JSON.parse(rawData) : {};
            myBot = { ...myBot, ...jsonData };

            for (const pluginName in pluginLoader.availablePlugins) {
                const pluginInfo = pluginLoader.availablePlugins[pluginName];
                if (pluginInfo.defaultSettings && !myBot.pluginSettings[pluginName]) {
                    myBot.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginInfo.defaultSettings));
                }
            }
            console.log('[LOG] Конфигурация бота загружена.');
        } catch (err) {
            console.error("[LOG] Ошибка чтения/парсинга main.json:", err);
            myBot = {
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
            saveBotData();
        }
    } else {
        console.log('[LOG] Файл main.json не найден, создаем с дефолтной конфигурацией.');
        saveBotData();
    }
}

function saveBotData() {
    try {
        const cleanedPluginSettings = {};
        for (const pluginName in myBot.pluginSettings) {
            if (pluginLoader.availablePlugins[pluginName]) {
                cleanedPluginSettings[pluginName] = myBot.pluginSettings[pluginName];
            }
        }
        myBot.pluginSettings = cleanedPluginSettings;

        fs.writeFileSync(filePath, JSON.stringify(myBot, null, 4));
        console.log('[LOG] Файл main.json обновлен.');

        const updatedData = JSON.stringify({
            type: "botInfo",
            data: { ...myBot, botIsRunning: bot !== null }
        });
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) client.send(updatedData);
        });
    } catch (err) {
        console.error("[LOG] Ошибка записи в main.json:", err);
    }
}

loadBotData();

app.use(express.static(path.join(__dirname, "dist")));

app.get('/export-bot-data', (req, res) => {
    console.log(`[LOG] Попытка экспорта файла: ${filePath}`);
    if (fs.existsSync(filePath)) {
        try {
            res.setHeader('Content-Disposition', 'attachment; filename="main.json"');
            res.setHeader('Content-Type', 'application/json');
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);

            readStream.on('error', (err) => {
                console.error(`[ERROR] Ошибка при чтении файла main.json для экспорта: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).send(`Ошибка сервера при чтении файла для экспорта: ${err.message}`);
                }
            });

            console.log('[LOG] Файл main.json отправлен на экспорт через stream.');
        } catch (err) {
            console.error(`[ERROR] Неожиданная ошибка при подготовке экспорта main.json: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).send(`Внутренняя ошибка сервера при подготовке экспорта: ${err.message}`);
            }
        }
    } else {
        res.status(404).send('Файл main.json не найден. Возможно, бот еще не был создан или его конфигурация не сохранена.');
        console.warn('[WARN] Попытка экспорта main.json, но файл не найден.');
    }
});

app.get('/api/commits', async (req, res) => {
    const owner = 'Semleks';
    const repo = 'BotMine';
    const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/commits`;

    try {
        const response = await axios.get(githubApiUrl, {
            headers: { 'User-Agent': 'BotMine-App' },
            params: { per_page: 10 }
        });

        const commits = response.data.map(commit => ({
            sha: commit.sha,
            message: commit.commit.message.split('\n')[0],
            author: commit.author ? commit.author.login : commit.commit.author.name,
            authorUrl: commit.author ? commit.author.html_url : null,
            date: commit.commit.author.date,
            commitUrl: commit.html_url
        }));

        res.json(commits);
        console.log('[LOG] Отправлен список последних коммитов.');
    } catch (error) {
        console.error('[LOG] Ошибка при получении коммитов с GitHub:', error.message);
        if (error.response) {
            console.error('[LOG] GitHub API response error:', error.response.status, error.response.data);
            res.status(error.response.status).json({ message: 'Ошибка получения коммитов с GitHub', details: error.response.data });
        } else if (error.request) {
            console.error('[LOG] GitHub API no response:', error.request);
            res.status(500).json({ message: 'Нет ответа от GitHub API' });
        } else {
            console.error('[LOG] GitHub API request setup error:', error.message);
            res.status(500).json({ message: 'Ошибка настройки запроса к GitHub API' });
        }
    }
});


app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

wss.on("connection", (ws) => {
    console.log("[LOG] Клиент подключен к WebSocket");

    ws.send(JSON.stringify({ type: "botInfo", data: { ...myBot, botIsRunning: bot !== null } }));
    ws.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins }));

    ws.on("message", (msg) => {
        const data = JSON.parse(msg.toString());
        console.log(`[LOG] WebSocket: получена команда "${data.type}"`);

        switch (data.type) {
            case "savePluginSettings": {
                const { pluginName, settings } = data;
                if (!myBot.pluginSettings[pluginName]) {
                    myBot.pluginSettings[pluginName] = {};
                }
                for (const key in settings) {
                    if (myBot.pluginSettings[pluginName][key]) {
                        myBot.pluginSettings[pluginName][key].value = settings[key];
                    } else {
                        myBot.pluginSettings[pluginName][key] = {
                            label: key,
                            value: settings[key]
                        };
                    }
                }
                log("status", `Настройки для плагина "${pluginName}" сохранены.`, ws);
                saveBotData();
                break;
            }

            case "togglePlugin": {
                const { pluginName } = data;
                const pluginIndex = myBot.activatedPlugins.indexOf(pluginName);

                if (pluginIndex > -1) {
                    myBot.activatedPlugins.splice(pluginIndex, 1);
                    pluginLoader.unloadPlugin(pluginName);
                    log("status", `Плагин "${pluginName}" отключен.`, ws);
                } else {
                    if (!pluginLoader.availablePlugins[pluginName]) {
                        log("status", `Ошибка: Плагин "${pluginName}" не найден среди доступных.`, ws);
                        return;
                    }
                    myBot.activatedPlugins.push(pluginName);
                    const pluginInfo = pluginLoader.availablePlugins[pluginName];
                    if (pluginInfo && pluginInfo.defaultSettings && !myBot.pluginSettings[pluginName]) {
                        myBot.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginInfo.defaultSettings));
                    }
                    log("status", `Плагин "${pluginName}" включен.`, ws);
                }
                saveBotData();
                if (bot) {
                    log("status", "Для применения изменений перезапустите бота.", ws);
                }
                break;
            }

            case "stopBot": {
                if (bot) {
                    log("status", "Выключаю бота...", ws);
                    commitWatcher.stop();
                    bot.removeAllListeners();
                    bot.end();
                    bot = null;
                    saveBotData();
                } else {
                    log("status", "Бот и так не запущен.", ws);
                }
                break;
            }

            case "deleteBot": {
                if (bot) {
                    bot.end();
                    bot = null;
                }
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        log("status", "Файл main.json был удален.", ws);
                        console.log("[LOG] Файл main.json был удален.");
                    } else {
                        log("status", "Файл main.json не найден, нечего удалять.", ws);
                    }
                    loadBotData();
                } catch (error) {
                    log("status", `Ошибка при удалении main.json: ${error.message}`, ws);
                    console.error("[LOG] Ошибка при удалении main.json:", error);
                }
                break;
            }

            case "startBot": {
                if (bot) {
                    log("status", "Перезапускаем бота...", ws);
                    commitWatcher.stop();
                    bot.removeAllListeners(); // FIX: Remove listeners from the old bot instance
                    bot.end();
                    bot = null;
                }
                if (!myBot.server || !myBot.nick) {
                    log("status", "Ошибка: Ник или сервер не указаны.", ws);
                    return;
                }

                log("status", `Подключение к ${myBot.server} с ником ${myBot.nick}...`, ws);
                bot = mineflayer.createBot({
                    host: myBot.server,
                    username: myBot.nick,
                    auth: 'offline',
                    version: '1.16.5'
                });
                
                saveBotData();

                pluginLoader.loadActivePlugins(bot, myBot, botAPI);
                commitWatcher.start(bot, myBot.commitWatcherSettings, botAPI);

                bot.on('spawn', (spawnEvent) => {
                    Object.values(pluginLoader.loadedPlugins).forEach(pluginInstance => {
                        if (pluginInstance.onSpawn) {
                            try {
                                pluginInstance.onSpawn(spawnEvent);
                            } catch (e) {
                                console.error(`[SERVER] Ошибка в onSpawn плагина ${pluginInstance.constructor.name}:`, e);
                            }
                        }
                    });
                });

                bot.on('message', (jsonMsg) => {
                    const text = jsonMsg.toString();
                    wss.clients.forEach(client => {
                        if (client.readyState === client.OPEN) {
                            if (text.trim() === "")
                                return;
                            client.send(JSON.stringify({ type: "chat", message: jsonMsg.toHTML() }));
                        }
                    });

                    if (text.includes("dev")) {
                        bot.chat('/cc Этот бот создан с помощью BotMine!');
                    }

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

                bot.on('playerJoined', (player) => {
                    Object.values(pluginLoader.loadedPlugins).forEach(pluginInstance => {
                        if (pluginInstance.onPlayerJoined) {
                            try {
                                pluginInstance.onPlayerJoined(player);
                            } catch (e) {
                                console.error(`[SERVER] Ошибка в onPlayerJoined плагина ${pluginInstance.constructor.name}:`, e);
                            }
                        }
                    });
                });

                bot.on('end', (reason) => {
                    log("status", "Соединение завершено. Причина: " + reason, ws);
                    commitWatcher.stop();
                    bot = null;
                    saveBotData();
                });
                bot.on('error', (err) => {
                    log("status", "Ошибка подключения: " + err.message, ws);
                    commitWatcher.stop();
                    bot = null;
                    saveBotData();
                });
                bot.on('kicked', (reason) => {
                    if (reason.includes("Игрок с таким ником уже онлайн"))
                    {

                    } else {
                        log("status", "Кикнут с сервера: " + reason, ws);
                        commitWatcher.stop();
                        bot = null;
                        saveBotData();
                    }
                });

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
                if (bot) {
                    bot.end();
                    bot = null;
                }
                myBot.nick = data.username;
                myBot.password = data.password;
                myBot.server = data.host;
                log("status", "Данные бота сохранены.", ws);
                saveBotData();
                log("status", "Бот создан/изменен. Для запуска нажмите 'Запустить'.", ws);
                break;
            }

            case "importBotData": {
                const { content } = data;
                try {
                    const importedData = JSON.parse(content);
                    if (typeof importedData.nick !== 'string' || typeof importedData.server !== 'string') {
                        throw new Error("Некорректный формат импортированного файла. Отсутствуют обязательные поля (nick, server).");
                    }

                    myBot.nick = importedData.nick || "";
                    myBot.password = importedData.password || "";
                    myBot.server = importedData.server || "";
                    myBot.activatedPlugins = Array.isArray(importedData.activatedPlugins) ? importedData.activatedPlugins : [];
                    myBot.pluginSettings = typeof importedData.pluginSettings === 'object' && importedData.pluginSettings !== null ? importedData.pluginSettings : {};
                    myBot.commitWatcherSettings = typeof importedData.commitWatcherSettings === 'object' && importedData.commitWatcherSettings !== null ? { ...myBot.commitWatcherSettings, ...importedData.commitWatcherSettings } : myBot.commitWatcherSettings;

                    for (const pluginName of myBot.activatedPlugins) {
                        if (pluginLoader.availablePlugins[pluginName] && pluginLoader.availablePlugins[pluginName].defaultSettings && !myBot.pluginSettings[pluginName]) {
                            myBot.pluginSettings[pluginName] = JSON.parse(JSON.stringify(pluginLoader.availablePlugins[pluginName].defaultSettings));
                        }
                    }

                    saveBotData();
                    log("status", "Конфигурация бота успешно импортирована.", ws);
                    if (bot) {
                        log("status", "Для применения импортированных настроек, пожалуйста, перезапустите бота.", ws);
                    }
                } catch (error) {
                    log("status", `Ошибка импорта конфигурации: ${error.message}`, ws);
                    console.error("[LOG] Ошибка импорта конфигурации:", error);
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
                        log("pluginUploadStatus", "Ваш плагин неправильно собран. Отсутствует manifest.json или index.js в корне архива. Воспользуйтесь документацией.", ws, false);
                        return;
                    }

                    let parsedManifest;
                    try {
                        const manifestContent = manifestEntry.getData().toString('utf8');
                        parsedManifest = JSON.parse(manifestContent);
                    } catch (e) {
                        log("pluginUploadStatus", `Ошибка: manifest.json содержит некорректный JSON. Детали: ${e.message}`, ws, false);
                        return;
                    }

                    if (!parsedManifest.name || typeof parsedManifest.name !== 'string' || parsedManifest.name.trim() === '') {
                        log("pluginUploadStatus", "Ошибка: В manifest.json отсутствует или некорректно задано поле 'name' (должно быть непустой строкой).", ws, false);
                        return;
                    }
                    if (!parsedManifest.description || typeof parsedManifest.description !== 'string') {
                        log("pluginUploadStatus", "Ошибка: В manifest.json отсутствует или некорректно задано поле 'description' (должно быть строкой).", ws, false);
                        return;
                    }
                    if (parsedManifest.defaultSettings && typeof parsedManifest.defaultSettings !== 'object' || Array.isArray(parsedManifest.defaultSettings)) {
                        log("pluginUploadStatus", "Ошибка: В manifest.json поле 'defaultSettings' должно быть объектом (если присутствует).", ws, false);
                        return;
                    }

                    const indexJsContent = indexJsEntry.getData().toString('utf8');
                    const onMessageRegex = /onMessage\s*\((\s*message\s*,\s*json\s*)?\)|\bonMessage\s*:\s*function\s*\(/;
                    if (!onMessageRegex.test(indexJsContent)) {
                        log("pluginUploadStatus", "Ошибка: В index.js не найден метод 'onMessage(message, json)' или 'onMessage: function()'.", ws, false);
                        return;
                    }

                    let pluginDirName = parsedManifest.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    if (pluginDirName.length === 0) {
                        pluginDirName = `plugin_${Date.now()}`;
                    }
                    const targetPluginPath = path.join(pluginsRootPath, pluginDirName);

                    if (!fs.existsSync(pluginsRootPath)) fs.mkdirSync(pluginsRootPath, { recursive: true });

                    if (fs.existsSync(targetPluginPath)) {
                        console.warn(`[WARN] Директория плагина "${pluginDirName}" уже существует. Будет перезаписана.`);
                        fs.rmSync(targetPluginPath, { recursive: true, force: true });
                    }

                    zip.extractAllTo(targetPluginPath, true);
                    log("pluginUploadStatus", `Плагин "${parsedManifest.name}" успешно установлен.`, ws, true);
                    console.log(`[LOG] Плагин "${pluginDirName}" успешно установлен в "${targetPluginPath}".`);

                    pluginLoader.loadPluginsFromDisk();
                    wss.clients.forEach(c => { if(c.readyState === c.OPEN) c.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins }))});
                } catch (error) {
                    log("pluginUploadStatus", `Ошибка при установке плагина: ${error.message}`, ws, false);
                    console.error("[LOG] Ошибка при установке плагина:", error);
                }
                break;
            }

            case "createPluginScaffold": {
                const { pluginName, pluginDescription } = data;
                const pluginDirName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_');
                const targetPluginPath = path.join(pluginsRootPath, pluginDirName);

                if (fs.existsSync(targetPluginPath)) {
                    log("status", `Ошибка: Плагин с именем "${pluginName}" уже существует.`, ws);
                    return;
                }
                try {
                    fs.mkdirSync(targetPluginPath, { recursive: true });
                    const manifestContent = JSON.stringify({ name: pluginName, description: pluginDescription, visual: true }, null, 4);
                    fs.writeFileSync(path.join(targetPluginPath, 'manifest.json'), manifestContent);
                    const indexJsContent = `// @visual-editor-plugin\nclass ${pluginName} {\n    constructor(bot, botInfo, botAPI) {\n        this.bot = bot;\n        this.botInfo = botInfo;\n        this.botAPI = botAPI;\n    }\n}\nmodule.exports = ${pluginName};`;
                    fs.writeFileSync(path.join(targetPluginPath, 'index.js'), indexJsContent);
                    log("pluginScaffoldCreated", `Плагин "${pluginName}" создан.`, ws, true, { pluginName });
                    pluginLoader.loadPluginsFromDisk();
                    wss.clients.forEach(c => { if (c.readyState === c.OPEN) c.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins })) });
                } catch (error) {
                    log("status", `Ошибка создания плагина: ${error.message}`, ws);
                }
                break;
            }

            case "getPluginCode": {
                const { pluginName } = data;
                const pluginDirName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_');
                const pluginPath = path.join(pluginsRootPath, pluginDirName, 'index.js');
                if (fs.existsSync(pluginPath)) {
                    const code = fs.readFileSync(pluginPath, 'utf-8');
                    ws.send(JSON.stringify({ type: 'pluginCodeResponse', pluginName, code, success: true }));
                } else {
                    ws.send(JSON.stringify({ type: 'pluginCodeResponse', message: 'Файл index.js не найден.', success: false }));
                }
                break;
            }

            case "saveVisualPlugin": {
                const { pluginName, code } = data;
                const pluginDirName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_');
                const pluginIndexPath = path.join(pluginsRootPath, pluginDirName, 'index.js');
                try {
                    fs.writeFileSync(pluginIndexPath, code);
                    log("pluginSaveStatus", `Плагин "${pluginName}" сохранен.`, ws, true);
                } catch (error) {
                    log("pluginSaveStatus", `Ошибка сохранения: ${error.message}`, ws, false);
                }
                break;
            }

            case "deletePlugin": {
                const { pluginName } = data;
                const pluginDirName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_');
                const targetPluginPath = path.join(pluginsRootPath, pluginDirName);

                if (!fs.existsSync(targetPluginPath)) {
                    log("status", `Ошибка: Плагин "${pluginName}" не найден для удаления.`, ws);
                    return;
                }

                try {
                    fs.rmSync(targetPluginPath, { recursive: true, force: true });

                    const pluginIndex = myBot.activatedPlugins.indexOf(pluginName);
                    if (pluginIndex > -1) {
                        myBot.activatedPlugins.splice(pluginIndex, 1);
                    }
                    delete myBot.pluginSettings[pluginName];
                    saveBotData();

                    log("status", `Плагин "${pluginName}" успешно удален.`, ws);

                    pluginLoader.loadPluginsFromDisk();
                    wss.clients.forEach(c => { if (c.readyState === c.OPEN) c.send(JSON.stringify({ type: "availablePlugins", data: pluginLoader.availablePlugins })) });
                } catch (error) {
                    log("status", `Ошибка при удалении плагина: ${error.message}`, ws);
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

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

setInterval(() => {
    const ram = process.memoryUsage().rss / (1024 * 1024);
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();
    const elapsedTime = (currentTime - lastCpuTime) * 1000;
    const elapsedUsage = (currentCpuUsage.user - lastCpuUsage.user) + (currentCpuUsage.system - lastCpuUsage.system);
    const cpuPercent = (100 * elapsedUsage / elapsedTime) / os.cpus().length;

    lastCpuUsage = currentCpuUsage;
    lastCpuTime = currentTime;

    const usageData = JSON.stringify({
        type: "systemUsage",
        cpu: cpuPercent,
        ram: ram
    });

    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(usageData);
        }
    });
}, 2000);


function log(type, message, ws, isSuccess = true, additionalData = {}) {
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type, success: isSuccess, message, ...additionalData }));
    }
}