class Send {
    SendMessage(type, text, nick, bot)
    {
        if (bot === undefined)
            return;

        if (type === 'private')
        {
            bot.chat(`/m ${nick} ${text}`);
            console.log(`Новое сообщение (${type}) ${text} игроку ${nick}`)
            return;
        }

        if (type === 'local')
        {
            bot.chat(`${nick}, ${text}`);
            console.log(`Новое сообщение (${type}) ${text} игроку ${nick}`)
            return;
        }

        if (type === 'global')
        {
            bot.chat(`!${text}`);
            //console.log(`Новое сообщение (${type}) ${text}`)
            return;
        }

        if (type === 'cmd')
        {
            bot.chat(`${text}`);
            console.log(`Новая команда ${text}`)
            return;
        }

        if (type === 'clan') {
            if (nick === '')
                bot.chat(`/cc ${text}`);
            else
                bot.chat(`/cc ${nick}, ${text}`);
            console.log(`Новое сообщение (${type}) ${text}`)
            return;
        }

        console.log(`type: ${type} не найден.`);
    }
}

module.exports = Send;