let fetch;
let HttpsProxyAgent;

let agent;

const MODEL_NAME = "models/gemini-2.5-flash-lite";

class AI {
    constructor(host, port) {
        this.host = host;
        this.port = port;
        this._loadModules();
    }

    async _loadModules() {
        if (!fetch) {
            try {
                const nodeFetchModule = await import("node-fetch");
                fetch = nodeFetchModule.default;

                const httpsProxyAgentModule = await import("https-proxy-agent");
                HttpsProxyAgent = httpsProxyAgentModule.HttpsProxyAgent;

                if (this.host && this.port) {
                    console.log(`[AiAssistantPlugin] Proxy settings: ${this.host}:${this.port}`);
                    agent = new HttpsProxyAgent(`http://${this.host}:${this.port}`);
                } else {
                    agent = undefined; // Без прокси
                    console.log("[AiAssistantPlugin] Прокси не используется");
                }
            } catch (error) {
                console.error("Failed to load fetch or proxy agent modules:", error);
            }
        }
    }

    async NewQuestion(question, username, promt, api, proxyHost, proxyPort) {
        // Если переданы новые параметры прокси, обновим агент
        if (proxyHost && proxyPort) {
            agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
        } else {
            agent = undefined; // Без прокси
        }

        // Формируем промпт
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${api}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
                    agent: agent, // агент либо прокси, либо undefined
                }
            );

            if (!response.ok) {
                console.error("Google AI Studio Error:", response.status, await response.text());
                return "Извини, я не смог ответить на вопрос через Google AI Studio.";
            }

            const data = await response.json();

            if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return data.candidates[0].content.parts[0].text;
            } else if (data?.promptFeedback?.blockReason) {
                console.warn("Content blocked by Google AI Studio:", data.promptFeedback.blockReason);
                return "Извини, твой запрос был заблокирован.";
            } else {
                return "Извини, не удалось сформулировать ответ от Google AI Studio.";
            }

        } catch (err) {
            console.error("Google AI Studio Exception:", err);
            return "Извини, я не смог ответить на вопрос из-за ошибки Node.js или прокси.";
        }
    }
}

module.exports = AI;