const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Переменные для хранения состояния. Они будут жить, пока работает сервер.
let lastCommitSha = null;
let timer = null;

/**
 * Внутренняя функция, которая выполняет проверку коммитов.
 * @param {object} bot - Экземпляр mineflayer бота.
 * @param {object} settings - Объект с настройками (owner, repo, branch и т.д.).
 * @param {object} botAPI - Экземпляр BotAPI для отправки сообщений.
 */
async function checkCommits(bot, settings, botAPI) {
    const { owner, repo, branch, chatMessage } = settings;

    if (!owner || !repo || !branch) {
        console.warn('[CommitWatcher] Настройки репозитория не указаны в server.js. Проверка отменена.');
        return;
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`;

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "BotMine-Commit-Watcher",
                "Accept": "application/vnd.github+json",
            },
        });

        if (!response.ok) {
            console.error(`[CommitWatcher] Ошибка API GitHub: ${response.status}`);
            return;
        }

        const commits = await response.json();
        if (commits.length === 0) return;

        const latestCommit = commits[0];
        const sha = latestCommit.sha;

        if (lastCommitSha && lastCommitSha !== sha) {
            const message = latestCommit.commit.message;
            const author = latestCommit.commit.author.name;

            console.log(`[CommitWatcher] Обнаружен новый коммит: "${message}" от ${author}`);

            const formattedMessage = chatMessage
                .replace('{message}', message)
                .replace('{author}', author);

            botAPI.sendMessage(bot, 'global', formattedMessage);
        }

        lastCommitSha = sha;
    } catch (err) {
        console.error("[CommitWatcher] Ошибка при проверке коммитов:", err);
    }
}

/**
 * Запускает отслеживание коммитов.
 * @param {object} bot - Экземпляр mineflayer бота.
 * @param {object} settings - Объект с настройками.
 * @param {object} botAPI - Экземпляр BotAPI.
 */
function start(bot, settings, botAPI) {
    // Если таймер уже запущен, останавливаем его, чтобы избежать дублирования
    if (timer) {
        clearInterval(timer);
    }

    const intervalMs = (settings.interval || 5) * 60 * 1000;

    // Вызываем проверку сразу, не дожидаясь первого интервала
    checkCommits(bot, settings, botAPI);

    // Устанавливаем таймер для периодических проверок
    timer = setInterval(() => checkCommits(bot, settings, botAPI), intervalMs);

    console.log(`[CommitWatcher] Отслеживание коммитов запущено с интервалом ${settings.interval} минут.`);
}

/**
 * Останавливает отслеживание коммитов.
 */
function stop() {
    if (timer) {
        clearInterval(timer);
        timer = null; // Сбрасываем таймер
        console.log('[CommitWatcher] Отслеживание коммитов остановлено.');
    }
}

// Экспортируем только две публичные функции: start и stop
module.exports = {
    start,
    stop
};