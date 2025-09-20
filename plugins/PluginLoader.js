const fs = require('fs');
const path = require('path');

class PluginLoader {
    constructor() {
        this.availablePlugins = {}; // { pluginName: { manifestData, path } }
        this.loadedPlugins = {};    // { pluginName: pluginInstance }
        this.scanForPlugins();
    }

    /**
     * Сканирует директорию /plugins и загружает метаданные (manifest.json) всех найденных плагинов.
     */
    scanForPlugins() {
        const pluginsDir = path.join(__dirname, '..', 'plugins');
        console.log('[PluginLoader] Сканирование директории плагинов...');

        if (!fs.existsSync(pluginsDir)) {
            console.warn('[PluginLoader] Директория /plugins не найдена. Создайте ее для добавления плагинов.');
            fs.mkdirSync(pluginsDir);
            return;
        }

        const pluginFolders = fs.readdirSync(pluginsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const folderName of pluginFolders) {
            const manifestPath = path.join(pluginsDir, folderName, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    this.availablePlugins[manifest.name] = {
                        path: path.join(pluginsDir, folderName, 'index.js'),
                        ...manifest
                    };
                } catch (e) {
                    console.error(`[PluginLoader] Ошибка чтения manifest.json для плагина ${folderName}:`, e);
                }
            }
        }
        console.log(`[PluginLoader] Найдено доступных плагинов: ${Object.keys(this.availablePlugins).length}`);
    }

    /**
     * Загружает и инициализирует все плагины, которые отмечены как активные в myBot.activatedPlugins.
     * @param {object} bot - Экземпляр mineflayer бота.
     * @param {object} myBot - Глобальный объект с данными бота.
     * @param {object} botAPI - Экземпляр BotAPI.
     */
    loadActivePlugins(bot, myBot, botAPI) {
        console.log('[PluginLoader] Загрузка активных плагинов...');
        this.loadedPlugins = {}; // Очищаем старые экземпляры

        for (const pluginName of myBot.activatedPlugins) {
            const pluginInfo = this.availablePlugins[pluginName];
            if (pluginInfo && fs.existsSync(pluginInfo.path)) {
                try {
                    // Очищаем кэш модуля, чтобы можно было вносить изменения в код плагина без перезапуска сервера
                    delete require.cache[require.resolve(pluginInfo.path)];
                    const PluginClass = require(pluginInfo.path);
                    this.loadedPlugins[pluginName] = new PluginClass(bot, myBot, botAPI);
                    console.log(`[PluginLoader] Плагин "${pluginName}" успешно загружен и инициализирован.`);
                } catch (e) {
                    console.error(`[PluginLoader] КРИТИЧЕСКАЯ ОШИБКА при инициализации плагина ${pluginName}:`, e);
                }
            }
        }
    }

    /**
     * Выгружает один конкретный плагин (удаляет его экземпляр).
     * @param {string} pluginName - Имя плагина для выгрузки.
     */
    unloadPlugin(pluginName) {
        if (this.loadedPlugins[pluginName] && typeof this.loadedPlugins[pluginName].onUnload === 'function') {
            this.loadedPlugins[pluginName].onUnload();
        }
        delete this.loadedPlugins[pluginName];
        console.log(`[PluginLoader] Плагин "${pluginName}" выгружен.`);
    }
}

// Экспортируем один экземпляр на все приложение (синглтон)
module.exports = new PluginLoader();