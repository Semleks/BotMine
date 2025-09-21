class RepeatingMessage {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.intervalId = null;
        this.pluginName = "RepeatingMessage";

        console.log(`[${this.pluginName}] Плагин загружен.`);
    }

    onMessage(message, json) {

    }

    start() {
        if (this.intervalId) {
            console.log(`[${this.pluginName}] Интервал уже запущен.`);
            return;
        }

        const settings = this.botInfo.pluginSettings[this.pluginName];
        const message = settings?.messageToSend?.value;
        const intervalMinutes = parseInt(settings?.intervalMinutes?.value, 10);

        if (!message) {
            console.warn(`[${this.pluginName}] Не настроено сообщение для отправки. Плагин не будет работать.`);
            return;
        }

        if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
            console.warn(`[${this.pluginName}] Некорректно настроен интервал. Использую дефолтный: 2 минуты.`);
            this.intervalMinutes = 2;
        } else {
            this.intervalMinutes = intervalMinutes;
        }

        console.log(`[${this.pluginName}] Запускаю отправку сообщения каждые ${this.intervalMinutes} минуты: "${message}"`);


        this.intervalId = setInterval(() => {
            if (this.bot && this.bot.entity) { // Проверяем, что бот подключен и имеет сущность
                this.botAPI.sendMessage(this.bot, "global", message);
                console.log(`[${this.pluginName}] Отправлено сообщение: "${message}"`);
            } else {
                console.log(`[${this.pluginName}] Бот не онлайн, сообщение не отправлено.`);
            }
        }, this.intervalMinutes * 60 * 1000); // Преобразуем минуты в миллисекунды
    }

    // Метод для остановки функционала плагина
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log(`[${this.pluginName}] Отправка сообщений остановлена.`);
        }
    }
}

module.exports = RepeatingMessage;