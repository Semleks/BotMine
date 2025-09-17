class GetText {
    getText(text) {
        const privatePattern = /\[(.*?)\s+->\s+я\]\s+(.+)/;
        const clanPattern = /КЛАН:\s*(.+?):\s*(.*)/;
        const cleanedMessageText = text.replace(/❤\s?/u, '').trim();

        try {
            const match = cleanedMessageText.match(privatePattern);
            if (match) {
                if (text.includes("[я"))
                    return "none";
                return text.split('я]')[1];
            } else if (/\[ʟ\]/.test(cleanedMessageText)) {
                return text.split('⇨')[1];
            } else if (/\[ɢ\]/.test(cleanedMessageText)) {
                return text.split('⇨')[1];
            } else if (cleanedMessageText.startsWith("КЛАН:")) {
                const match = cleanedMessageText.match(clanPattern);
                if (match) {
                    const words = match[1].trim().split(/\s+/);
                    const pattern = words.length > 1 ? words[words.length - 1] : words[0];
                    console.log(pattern);
                    return text.split(pattern + ":")[1];
                }
            }
        } catch (error) {
            return "none";
        }

        return "none";
    }
}

module.exports = GetText;