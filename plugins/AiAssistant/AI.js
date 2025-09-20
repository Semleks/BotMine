let fetch;
let HttpsProxyAgent;

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 2081;

const MODEL_NAME = "models/gemini-2.5-flash-lite";

let agent;

class AI {
    constructor() {
        this._loadModules();
    }

    async _loadModules() {
        if (!fetch) { // Загружаем только один раз
            try {
                const nodeFetchModule = await import("node-fetch");
                fetch = nodeFetchModule.default;

                const httpsProxyAgentModule = await import("https-proxy-agent");
                HttpsProxyAgent = httpsProxyAgentModule.HttpsProxyAgent;

                agent = new HttpsProxyAgent(`http://${PROXY_HOST}:${PROXY_PORT}`);
            } catch (error) {
                console.error("Failed to load fetch or proxy agent modules:", error);
                // В реальном приложении здесь можно выбросить ошибку или как-то иначе обработать
            }
        }
    }

    async NewQuestion(question, username, promt, api) {
        // Убедимся, что модули загружены
        await this._loadModules();

        // Формируем промпт для нейросети
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${api}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: promt + ". Вопрос: " + question,
                                    },
                                ],
                            },
                        ],
                    }),
                    agent: agent, // Используем настроенный прокси-агент
                }
            );

            if (!response.ok) {
                // Логгируем ошибку API, если запрос был неуспешен
                console.error("Google AI Studio Error:", response.status, await response.text());
                return "Извини, я не смог ответить на вопрос через Google AI Studio.";
            }

            const data = await response.json();

            // Парсим ответ от Gemini API
            if (data && data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0 &&
                typeof data.candidates[0].content.parts[0].text === 'string' &&
                data.candidates[0].content.parts[0].text.length > 0
            ) {
                return data.candidates[0].content.parts[0].text;
            } else {
                // Если не удалось извлечь текст, проверяем причину блокировки
                if (data.promptFeedback && data.promptFeedback.blockReason) {
                    console.warn("Content blocked by Google AI Studio:", data.promptFeedback.blockReason);
                    return "Извини, твой запрос был заблокирован из-за потенциально небезопасного контента.";
                }
                // В противном случае, это проблема с парсингом или пустой ответ
                return "Извини, я не смог сформулировать ответ от Google AI Studio. (Ошибка парсинга или пустой ответ).";
            }

        } catch (err) {
            // Логгируем исключения, которые могут возникнуть в процессе выполнения запроса
            console.error("Google AI Studio Exception:", err);
            return "Извини, я не смог ответить на вопрос из-за внутренней ошибки Node.js или прокси.";
        }
    }
}

module.exports = AI;