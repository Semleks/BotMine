// Внутренние helper-функции для getNick
function extractUsernameFromClickEventPrivate(jsonMsg) {
    if (jsonMsg.clickEvent && jsonMsg.clickEvent.action === 'suggest_command') {
        const commandValue = jsonMsg.clickEvent.value;
        return commandValue.split(' ')[1].trim();
    }
    return null;
}

function extractClickEvent(chatMessage) {
    if (chatMessage.clickEvent) {
        const username = extractUsernameFromClickEvent(chatMessage.clickEvent);
        if (username) return username;
    }
    if (chatMessage.extra) {
        for (const part of chatMessage.extra) {
            const username = extractClickEvent(part);
            if (username) return username;
        }
    }
    return null;
}

function extractUsernameFromClickEvent(clickEvent) {
    if (clickEvent.action === 'suggest_command') {
        const regex = /\/msg (\S+) /;
        const match = clickEvent.value.match(regex);
        if (match) return match[1];
    }
    return null;
}

class BotAPI {
    /**
     * Отправляет сообщение в чат.
     * @param {object} bot - Экземпляр mineflayer бота.
     * @param {string} type - Тип сообщения ('private', 'local', 'global', 'cmd', 'clan').
     * @param {string} text - Текст сообщения.
     * @param {string} [nick=''] - Ник получателя (для приватных/клановых сообщений).
     */
    sendMessage(bot, type, text, nick = '') {
        if (!bot) return;

        const actions = {
            'private': () => bot.chat(`/m ${nick} ${text}`),
            'local': () => bot.chat(`${nick}, ${text}`),
            'global': () => bot.chat(`!${text}`),
            'cmd': () => bot.chat(text),
            'clan': () => bot.chat(nick ? `/cc ${nick}, ${text}` : `/cc ${text}`)
        };

        if (actions[type]) {
            actions[type]();
            console.log(`Отправлено (${type}): "${text}" игроку "${nick || 'всем'}"`);
        } else {
            console.log(`Ошибка: неизвестный тип сообщения "${type}"`);
        }
    }

    /**
     * Определяет тип чата по сообщению.
     * @param {string} text - Полный текст сообщения.
     * @returns {string} - 'private', 'global', 'local', 'clan' или 'none'.
     */
    getType(text) {
        try {
            const lowerCaseText = text.toLowerCase();
            if (lowerCaseText.includes("->") && lowerCaseText.includes("я")) return "private";
            if (text.includes("[ɢ]")) return "global";
            if (text.includes("[ʟ]")) return "local";
            if (lowerCaseText.includes("клан")) return 'clan';
            return 'none';
        } catch (e) {
            return 'none';
        }
    }

    /**
     * Извлекает ник игрока из сообщения.
     * @param {string} text - Полный текст сообщения.
     * @param {object} jsonMsg - JSON-представление сообщения от mineflayer.
     * @returns {string} - Ник игрока или 'none'.
     */
    getNick(text, jsonMsg) {
        const privatePattern = /\[(.*?)\s+->\s+я\]\s+(.+)/;
        const clanPattern = /КЛАН:\s*(.+?):\s*(.*)/;
        const cleanedMessageText = text.replace(/❤\s?/u, '').trim();

        try {
            if (cleanedMessageText.match(privatePattern)) {
                return extractUsernameFromClickEventPrivate(jsonMsg) || "none";
            }
            if (/\[ʟ\]|\[ɢ\]/.test(cleanedMessageText)) {
                return extractClickEvent(jsonMsg) || "none";
            }
            if (cleanedMessageText.startsWith("КЛАН:")) {
                const match = cleanedMessageText.match(clanPattern);
                if (match) {
                    const words = match[1].trim().split(/\s+/);
                    return words.length > 1 ? words[words.length - 1] : words[0];
                }
            }
        } catch (error) {
            return "none";
        }
        return "none";
    }

    /**
     * Извлекает "чистый" текст сообщения (без ников и префиксов).
     * @param {string} text - Полный текст сообщения.
     * @returns {string} - Текст сообщения или 'none'.
     */
    getText(text) {
        const privatePattern = /\[(.*?)\s+->\s+я\]\s+(.+)/;
        const clanPattern = /КЛАН:\s*(.+?):\s*(.*)/;
        const cleanedMessageText = text.replace(/❤\s?/u, '').trim();

        try {
            if (cleanedMessageText.match(privatePattern)) {
                return cleanedMessageText.split('я]')[1].trim();
            }
            if (/\[ʟ\]|\[ɢ\]/.test(cleanedMessageText)) {
                return cleanedMessageText.split('⇨')[1].trim();
            }
            if (cleanedMessageText.startsWith("КЛАН:")) {
                const match = cleanedMessageText.match(clanPattern);
                if (match) {
                    const senderPart = match[1]; // Часть с ником и префиксами
                    // Обрезаем исходное сообщение после части с отправителем
                    return cleanedMessageText.substring(cleanedMessageText.indexOf(senderPart) + senderPart.length + 1).trim();
                }
            }
        } catch (error) {
            return "none";
        }
        return "none";
    }
}

module.exports = new BotAPI();