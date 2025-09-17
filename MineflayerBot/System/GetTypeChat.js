class GetTypeChat {
    getType(text)
    {
        try {
            // Небольшое улучшение: приведем текст к нижнему регистру для надежности
            const lowerCaseText = text.toLowerCase();

            if (lowerCaseText.includes("->") && lowerCaseText.includes("я"))
                return "private";
            if (text.includes("[ɢ]")) // Здесь регистр может быть важен
                return "global";
            if (text.includes("[ʟ]")) // И здесь
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