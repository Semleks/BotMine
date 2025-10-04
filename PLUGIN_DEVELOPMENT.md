# Документация по созданию плагинов для Botmine

Этот документ описывает, как создавать собственные плагины для расширения функциональности бота.

## Структура плагина

Каждый плагин должен находиться в отдельной папке внутри директории `/plugins`.
Плагин должен состоять как минимум из двух файлов:

1.  `manifest.json`: Файл с метаданными плагина (имя, описание, настройки).
2.  `index.js`: Основной файл с логикой плагина.

**Пример структуры:**
```
/plugins
└───/MyCoolPlugin
    ├─── manifest.json
    └─── index.js
```

---

## `manifest.json`

Это JSON-файл, который описывает ваш плагин.

### Поля манифеста

- `name` (String, **обязательно**): Уникальное имя плагина. Используется как идентификатор. Должно совпадать с именем класса в `index.js`.
- `description` (String, **обязательно**): Краткое описание того, что делает плагин.
- `defaultSettings` (Object, *опционально*): Объект, описывающий настройки плагина, которые можно будет изменять через пользовательский интерфейс.

### Конфигурация настроек (`defaultSettings`)

Объект `defaultSettings` содержит другие объекты, где каждый ключ — это уникальное имя настройки. Каждый объект настройки должен иметь следующую структуру:

- `label` (String): Человекочитаемое название настройки. Будет отображаться в UI.
- `value` (String | Number | Boolean): Значение по умолчанию для этой настройки.

**Пример `manifest.json`:**
```json
{
  "name": "MyCoolPlugin",
  "description": "Этот плагин делает крутые вещи.",
  "defaultSettings": {
    "greetingMessage": {
      "label": "Сообщение для приветствия:",
      "value": "Всем привет!"
    },
    "enableSpam": {
      "label": "Включить спам:",
      "value": false
    },
    "spamInterval": {
      "label": "Интервал спама (в минутах):",
      "value": 5
    }
  }
}
```

---

## `index.js`

Это сердце вашего плагина. Файл должен экспортировать класс с тем же именем, что и `name` в манифесте.

### Класс плагина

Загрузчик плагинов автоматически создает экземпляр вашего класса и передает в конструктор три аргумента.

```javascript
class MyCoolPlugin {
    constructor(bot, botInfo, botAPI) {
        // Код, который выполняется при загрузке плагина
    }
}

module.exports = MyCoolPlugin;
```

#### Аргументы конструктора

1.  `bot`: Экземпляр бота `mineflayer`. Вы можете использовать его для взаимодействия с миром Minecraft (например, `bot.chat()`, `bot.on('event', ...)`).
2.  `botInfo`: Объект с общей информацией о боте. Самое важное здесь — это `botInfo.pluginSettings`, где хранятся **текущие** значения настроек вашего плагина.
3.  `botAPI`: Вспомогательный объект с готовыми методами для упрощения разработки. Например, `botAPI.sendMessage()`.

### Жизненный цикл плагина

Класс плагина может содержать специальные методы, которые система вызывает на разных этапах его работы:

- `constructor()`: Вызывается один раз при загрузке плагина. Идеально для инициализации.
- `start()`: Вызывается, когда плагин активируется. Используйте этот метод для запуска повторяющихся задач (например, `setInterval`).
- `stop()`: Вызывается, когда плагин деактивируется. Используйте для остановки задач, запущенных в `start()` (например, `clearInterval`).
- `onMessage(message, json)`: Вызывается каждый раз, когда в чат приходит новое сообщение.

### Доступ к настройкам

Настройки, определенные в `manifest.json`, доступны внутри плагина через объект `botInfo`.

```javascript
const settings = this.botInfo.pluginSettings[this.pluginName];
const greeting = settings?.greetingMessage?.value;
const interval = parseInt(settings?.spamInterval?.value, 10);
```
**Важно:** `this.pluginName` должно быть равно имени плагина из манифеста.

### Пример `index.js`

```javascript
class MyCoolPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.intervalId = null;
        this.pluginName = "MyCoolPlugin"; // Должно совпадать с name в manifest.json

        console.log(`[${this.pluginName}] Плагин успешно загружен!`);
    }

    // Вызывается при получении сообщения в чат
    onMessage(message, json) {
        const settings = this.botInfo.pluginSettings[this.pluginName];
        const greeting = settings?.greetingMessage?.value;

        if (message.toLowerCase().includes('привет бот')) {
            this.botAPI.sendMessage(this.bot, "global", greeting);
        }
    }

    // Вызывается при активации плагина
    start() {
        const settings = this.botInfo.pluginSettings[this.pluginName];
        const enableSpam = settings?.enableSpam?.value;
        const intervalMinutes = parseInt(settings?.spamInterval?.value, 10);

        if (enableSpam) {
            console.log(`[${this.pluginName}] Запускаю спам каждые ${intervalMinutes} мин.`);
            this.intervalId = setInterval(() => {
                this.botAPI.sendMessage(this.bot, "global", "Это спам-сообщение от крутого плагина!");
            }, intervalMinutes * 60 * 1000);
        }
    }

    // Вызывается при деактивации плагина
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log(`[${this.pluginName}] Спам остановлен.`);
        }
    }
}

module.exports = MyCoolPlugin;
```
