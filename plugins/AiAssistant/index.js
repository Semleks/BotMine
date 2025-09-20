// Предполагается, что у вас есть файл AI.js с классом для работы с Gemini
// Положите его в эту же папку (plugins/AiAssistant/AI.js)
const AI = require('./AI');

class AiAssistantPlugin {
    constructor(bot, botInfo, botAPI) {
        this.bot = bot;
        this.botInfo = botInfo;
        this.botAPI = botAPI;
        this.ai = new AI();
        console.log('[AiAssistantPlugin] Плагин загружен.');
    }

    async onMessage(message, json) {
        const text = this.botAPI.getText(message);
        if (text === 'none') return;

        // Реагируем, если сообщение начинается с ника бота или слова "бот"
        if (text.toLowerCase().startsWith(this.botInfo.nick.toLowerCase()) || text.toLowerCase().startsWith('бот')) {
            const apiKey = this.botInfo.pluginSettings.AiAssistant?.key?.value;
            const promt = this.botInfo.pluginSettings.AiAssistant?.promt?.value;

            if (!apiKey) {
                console.log('[AiAssistantPlugin] API ключ не указан в настройках.');
                return;
            }

            const nick = this.botAPI.getNick(message, json);
            const type = this.botAPI.getType(message);

            if (nick === 'none' || type === 'none') return;

            console.log(`[AiAssistantPlugin] Получен вопрос от ${nick}: "${text}"`);

            try {
                const response = await this.ai.NewQuestion(text, nick, promt, apiKey);
                this.botAPI.sendMessage(this.bot, type, response, nick);
            } catch (e) {
                console.error('[AiAssistantPlugin] Ошибка при запросе к Gemini API:', e);
                this.botAPI.sendMessage(this.bot, type, 'У меня что-то с головой... не могу сейчас ответить.', nick);
            }
        }
    }
}

module.exports = AiAssistantPlugin;