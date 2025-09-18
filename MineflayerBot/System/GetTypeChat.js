class GetTypeChat {
    getType(text)
    {
        try {
            const lowerCaseText = text.toLowerCase();

            if (lowerCaseText.includes("->") && lowerCaseText.includes("я"))
                return "private";
            if (text.includes("[ɢ]")) 
                return "global";
            if (text.includes("[ʟ]"))
                return "local";
            if (lowerCaseText.includes("клан"))
                return 'clan';

            return 'none'; // Возвращаем 'none', если ничего не найдено
        } catch (e) {
            return 'none';
        }
    }
}

module.exports = GetTypeChat;