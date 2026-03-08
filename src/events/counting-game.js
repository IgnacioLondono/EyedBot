const Embeds = require('../utils/embeds');
const countingStore = require('../utils/counting-store');

const guildLocks = new Map();

function enqueueGuild(guildId, task) {
    const prev = guildLocks.get(guildId) || Promise.resolve();
    const next = prev.catch(() => null).then(task);

    guildLocks.set(guildId, next.finally(() => {
        if (guildLocks.get(guildId) === next) {
            guildLocks.delete(guildId);
        }
    }));

    return next;
}

async function handleCountingMessage(message) {
    if (!message || !message.guild || message.author?.bot) return;

    const guildId = message.guild.id;
    await enqueueGuild(guildId, async () => {
        const state = await countingStore.getGuildConfig(guildId);
        if (!state.enabled || !state.channelId) return;
        if (message.channel.id !== state.channelId) return;

        const content = (message.content || '').trim();
        const expected = Math.max(0, Number.parseInt(state.current || 0, 10) || 0) + 1;
        const parsed = Number.parseInt(content, 10);
        const isValidNumber = /^\d+$/.test(content);

        if (isValidNumber && parsed === expected) {
            await countingStore.setProgress(guildId, {
                current: parsed,
                lastUserId: message.author.id
            });
            await message.react('✅').catch(() => null);
            return;
        }

        await message.react('❌').catch(() => null);
        const reached = Math.max(0, Number.parseInt(state.current || 0, 10) || 0);
        await countingStore.resetProgress(guildId);

        const provided = isValidNumber ? String(parsed) : 'mensaje no valido';
        await message.channel.send({
            embeds: [
                Embeds.error(
                    'Contador reiniciado',
                    `${message.author} fallo la secuencia. Se esperaba **${expected}** y llego **${provided}**.\nNumero alcanzado: **${reached}**.\nEmpiecen de nuevo en **1**.`
                )
            ]
        }).catch(() => null);
    });
}

module.exports = {
    handleCountingMessage
};
