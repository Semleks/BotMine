class WelcomeMessage {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;

        this.log = (msg) => console.log(`[WelcomeMessage] ${msg}`);

        this.log('Конструктор вызван. Загружаем настройки...');

        // Настройки из панели
        this.targetUser = this.botInfo.pluginSettings?.WelcomeMessage?.targetUser?.value?.toLowerCase() || '';
        this.greetingMessage = this.botInfo.pluginSettings?.WelcomeMessage?.message?.value || 'Привет, {username}!';

        this.log(`targetUser: "${this.targetUser}"`);
        this.log(`greetingMessage: "${this.greetingMessage}"`);

        // Активация через 15 секунд
        this.isActivated = false;
        this.activationTimeout = setTimeout(() => {
            this.isActivated = true;
            this.log('✅ Плагин активирован и готов приветствовать игрока.');
        }, 15000);

        // Подключаем очистку таймера при завершении работы бота
        if (this.bot && this.bot.once) {
            this.bot.once('end', () => {
                clearTimeout(this.activationTimeout);
                this.log('❌ Бот завершил работу. Таймер активации очищен.');
            });
        }
    }
    
    onMessage(message, json) { //Заглуха. Так надо.
    }
    
    onPlayerJoined(player) {
        if (!this.isActivated) {
            return;
        }

        const usernameLower = player.username.toLowerCase();

        if (usernameLower === this.targetUser) {
            const finalMessage = this.greetingMessage.replace(/{username}/g, player.username);
            this.log(`Отправка приветствия: "${finalMessage}"`);

            try {
                this.botAPI.sendMessage(this.bot, 'global', finalMessage);
                this.log('✅ Сообщение успешно отправлено в глобальный чат.');
            } catch (e) {
                this.log(`❌ Ошибка при отправке сообщения: ${e.message}`);
            }
        }
    }
}

module.exports = WelcomeMessage;
