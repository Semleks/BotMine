class GetNickName {
    getNick(text, jsonMsg) {
        const privatePattern = /\[(.*?)\s+->\s+я\]\s+(.+)/;
        const clanPattern = /КЛАН:\s*(.+?):\s*(.*)/;
        const cleanedMessageText = text.replace(/❤\s?/u, '').trim();

        try {
            const match = cleanedMessageText.match(privatePattern);
            if (match) {
                return extractUsernameFromClickEventPrivate(jsonMsg) || "none";
            } else if (/\[ʟ\]/.test(cleanedMessageText)) {
                return extractClickEvent(jsonMsg) || "none";
            } else if (/\[ɢ\]/.test(cleanedMessageText)) {
                return extractClickEvent(jsonMsg) || "none";
            } else if (cleanedMessageText.startsWith("КЛАН:")) {
                const match = cleanedMessageText.match(clanPattern);
                if (match) {
                    const words = match[1].trim().split(/\s+/);
                    return words.length > 1 ? words[words.length - 1] : words[0];
                }
            }
        } catch (error) {
            return "none";
        }

        return "none"; // <-- важно
    }
}

function extractUsernameFromClickEventPrivate(jsonMsg) {
    if (jsonMsg.clickEvent.action === 'suggest_command') {
        const commandValue = jsonMsg.clickEvent.value;
        return commandValue.split(' ')[1].trim();
    }
    return null;
}

function extractClickEvent(chatMessage) {
    if (chatMessage.clickEvent) {
        const username = extractUsernameFromClickEvent(chatMessage.clickEvent);
        if (username) {
            return username;
        }
    }

    if (chatMessage.extra) {
        for (const part of chatMessage.extra) {
            const username = extractClickEvent(part); // Рекурсивная дрочка. Так надо
            if (username) {
                return username;
            }
        }
    }
    return null;
}

function extractUsernameFromClickEvent(clickEvent) {
    if (clickEvent.action === 'suggest_command') {
        const regex = /\/msg (\S+) /;
        const match = clickEvent.value.match(regex);
        if (match) {
            return match[1];
        }
    }
    return null;
}

module.exports = GetNickName;