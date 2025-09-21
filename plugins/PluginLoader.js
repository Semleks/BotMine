// plugins/PluginLoader.js
const path = require('path');
const fs = require('fs');

class PluginLoader {
    constructor() {
        this.availablePlugins = {}; // Хранит метаданные плагинов из манифестов
        this.loadedPlugins = {};   // Хранит экземпляры загруженных плагинов
        this.pluginsRootPath = __dirname; // Указывает на директорию 'plugins'
        this.loadPluginsFromDisk();
    }

    loadPluginsFromDisk() {
        this.availablePlugins = {}; // Очищаем существующие для обновления
        const pluginFolders = fs.readdirSync(this.pluginsRootPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const folderName of pluginFolders) {
            const pluginPath = path.join(this.pluginsRootPath, folderName);
            const manifestPath = path.join(pluginPath, 'manifest.json');
            const indexPath = path.join(pluginPath, 'index.js');

            if (fs.existsSync(manifestPath) && fs.existsSync(indexPath)) {
                try {
                    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                    const manifest = JSON.parse(manifestContent);
                    if (manifest.name && typeof manifest.name === 'string' && manifest.name.trim() !== '' &&
                        manifest.description && typeof manifest.description === 'string') {
                        this.availablePlugins[manifest.name] = {
                            name: manifest.name,
                            description: manifest.description,
                            path: indexPath,
                            defaultSettings: manifest.defaultSettings || {}
                        };
                        console.log(`[PluginLoader] Загружен манифест для плагина: ${manifest.name}`);
                    } else {
                        console.warn(`[PluginLoader] Манифест для плагина в ${folderName} некорректен (отсутствует или неверный name/description).`);
                    }
                } catch (e) {
                    console.error(`[PluginLoader] Ошибка чтения/парсинга манифеста для плагина в ${folderName}:`, e);
                }
            } else {
                console.warn(`[PluginLoader] Папка ${folderName} не содержит manifest.json или index.js.`);
            }
        }
    }

    /**
     * Загружает и запускает активные плагины.
     * @param {mineflayer.Bot} bot Экземпляр бота Mineflayer.
     * @param {object} botInfo Объект с информацией о боте (myBot).
     * @param {object} botAPI Объект с API для взаимодействия с ботом.
     */
    loadActivePlugins(bot, botInfo, botAPI) {
        // Сначала останавливаем и выгружаем плагины, которые больше не активны или требуют перезагрузки
        for (const pluginName in this.loadedPlugins) {
            // Если плагин больше не в списке активированных, или экземпляр бота изменился
            if (!botInfo.activatedPlugins.includes(pluginName) || this.loadedPlugins[pluginName].bot !== bot) {
                console.log(`[PluginLoader] Отключение и выгрузка плагина: ${pluginName}`);
                this.unloadPlugin(pluginName); // Вызываем unloadPlugin, который также вызовет stop()
            }
        }

        // Затем загружаем новые активные плагины или перезапускаем уже загруженные, если бот переподключился
        for (const pluginName of botInfo.activatedPlugins) {
            // Если плагин не загружен ИЛИ загруженный плагин имеет другой экземпляр бота (переподключение)
            if (!this.loadedPlugins[pluginName] || this.loadedPlugins[pluginName].bot !== bot) {
                const pluginInfo = this.availablePlugins[pluginName];
                if (pluginInfo) {
                    try {
                        // Очищаем кэш модуля, чтобы гарантировать свежую загрузку, если файл изменился
                        delete require.cache[require.resolve(pluginInfo.path)];
                        const PluginClass = require(pluginInfo.path);
                        this.loadedPlugins[pluginName] = new PluginClass(bot, botInfo, botAPI);
                        console.log(`[PluginLoader] Активирован плагин: ${pluginName}`);

                        // *** Вызываем метод start() плагина, если он есть ***
                        if (this.loadedPlugins[pluginName].start && typeof this.loadedPlugins[pluginName].start === 'function') {
                            this.loadedPlugins[pluginName].start();
                        }

                    } catch (e) {
                        console.error(`[PluginLoader] Ошибка при загрузке или инициализации плагина "${pluginName}":`, e);
                        // Удаляем из списка активированных, если плагин не удалось загрузить
                        const index = botInfo.activatedPlugins.indexOf(pluginName);
                        if (index > -1) botInfo.activatedPlugins.splice(index, 1);
                    }
                } else {
                    console.warn(`[PluginLoader] Активный плагин "${pluginName}" не найден среди доступных. Возможно, был удален.`);
                    // Удаляем из списка активированных, если он больше недоступен на диске
                    const index = botInfo.activatedPlugins.indexOf(pluginName);
                    if (index > -1) botInfo.activatedPlugins.splice(index, 1);
                }
            } else {
                // Плагин уже загружен с текущим экземпляром бота, просто убедимся, что он запущен (вызов start() внутри себя проверит)
                if (this.loadedPlugins[pluginName].start && typeof this.loadedPlugins[pluginName].start === 'function') {
                    this.loadedPlugins[pluginName].start();
                }
            }
        }
    }

    /**
     * Останавливает и выгружает один плагин.
     * @param {string} pluginName Имя плагина.
     */
    unloadPlugin(pluginName) {
        if (this.loadedPlugins[pluginName]) {
            // *** Вызываем метод stop() плагина, если он есть ***
            if (this.loadedPlugins[pluginName].stop && typeof this.loadedPlugins[pluginName].stop === 'function') {
                this.loadedPlugins[pluginName].stop();
            }
            delete this.loadedPlugins[pluginName];
            console.log(`[PluginLoader] Плагин "${pluginName}" выгружен.`);
            // Также удаляем из кэша require, чтобы гарантировать свежую загрузку в следующий раз
            const pluginInfo = this.availablePlugins[pluginName];
            if (pluginInfo && require.cache[require.resolve(pluginInfo.path)]) {
                delete require.cache[require.resolve(pluginInfo.path)];
            }
        }
    }

    /**
     * Останавливает все загруженные плагины.
     * Используется, например, при завершении работы бота.
     */
    stopAllLoadedPlugins() {
        console.log('[PluginLoader] Остановка всех активных плагинов...');
        for (const pluginName in this.loadedPlugins) {
            if (this.loadedPlugins[pluginName].stop && typeof this.loadedPlugins[pluginName].stop === 'function') {
                this.loadedPlugins[pluginName].stop();
            }
        }
        this.loadedPlugins = {}; // Очищаем список загруженных плагинов
    }
}

module.exports = new PluginLoader();