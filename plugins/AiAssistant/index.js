// Предполагается, что у вас есть файл AI.js с классом для работы с Gemini
// Положите его в эту же папку (plugins/AiAssistant/AI.js)
const AI = require('./AI');

class AiAssistantPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.ai = new AI(this.botInfo.pluginSettings.AiAssistant?.host?.value, this.botInfo.pluginSettings.AiAssistant?.port?.value);
        console.log('[AiAssistantPlugin] Плагин загружен.');
    }

    async onMessage(message, json) {
        const text = this.botAPI.getText(message);
        if (text === 'none') return;

        this.ai.NewQuestion("Привет", "Dream", this.botInfo.pluginSettings.AiAssistant?.promt?.value, this.botInfo.pluginSettings.AiAssistant?.key?.value, this.botInfo.pluginSettings.AiAssistant?.host?.value, this.botInfo.pluginSettings.AiAssistant?.port?.value);

        // Реагируем, если сообщение начинается с ника бота или слова "бот"
        if (text.toLowerCase().startsWith(this.botInfo.nick.toLowerCase()) || text.toLowerCase().startsWith('бот')) {
            const apiKey = this.botInfo.pluginSettings.AiAssistant?.key?.value;
            const promt = this.botInfo.pluginSettings.AiAssistant?.promt?.value;
            const port = this.botInfo.pluginSettings.AiAssistant?.port?.value;
            const host = this.botInfo.pluginSettings.AiAssistant?.host?.value;

            if (!apiKey || !promt || !port || !host) {
                console.warn('[AiAssistantPlugin] Настройки не настроены.');
                return;
            }

            const nick = this.botAPI.getNick(message, json);
            const type = this.botAPI.getType(message);

            if (nick === 'none' || type === 'none') return;

            console.log(`[AiAssistantPlugin] Получен вопрос от ${nick}: "${text}"`);

            try {
                const response = await this.ai.NewQuestion(text, nick, promt, apiKey, host, port);
                this.botAPI.sendMessage(this.bot, type, response, nick);
            } catch (e) {
                console.error('[AiAssistantPlugin] Ошибка при запросе к Gemini API:', e);
                this.botAPI.sendMessage(this.bot, type, 'У меня что-то с головой... не могу сейчас ответить.', nick);
            }
        }
    }
}

module.exports = AiAssistantPlugin;