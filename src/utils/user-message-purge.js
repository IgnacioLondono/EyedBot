const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const FETCH_BATCH = 100;
const MAX_SCAN = Math.max(
    100,
    Number.parseInt(process.env.USER_PURGE_MAX_SCAN || '50000', 10)
);
const OLD_DELETE_DELAY_MS = Math.max(
    100,
    Number.parseInt(process.env.USER_PURGE_OLD_DELAY_MS || '300', 10)
);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteMessageBatch(channel, messages) {
    if (!messages.length) return 0;

    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const recent = messages.filter((msg) => msg.createdTimestamp >= cutoff);
    const old = messages.filter((msg) => msg.createdTimestamp < cutoff);
    let deleted = 0;

    if (recent.length) {
        try {
            const result = await channel.bulkDelete(recent, true);
            deleted += result.size;
        } catch {
            for (const msg of recent) {
                try {
                    await msg.delete();
                    deleted += 1;
                } catch {
                    // ignore
                }
            }
        }
    }

    for (const msg of old) {
        try {
            await msg.delete();
            deleted += 1;
        } catch {
            // ignore
        }
        if (OLD_DELETE_DELAY_MS > 0) {
            await sleep(OLD_DELETE_DELAY_MS);
        }
    }

    return deleted;
}

/**
 * Elimina todos los mensajes de un usuario en un canal de texto (historial completo).
 * @returns {{ deleted: number, scanned: number, hitScanLimit: boolean }}
 */
async function purgeUserMessagesInChannel(channel, userId, options = {}) {
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    let deleted = 0;
    let scanned = 0;
    let before;
    let hitScanLimit = false;

    while (true) {
        const fetchOpts = { limit: FETCH_BATCH };
        if (before) fetchOpts.before = before;

        const fetched = await channel.messages.fetch(fetchOpts);
        if (!fetched.size) break;

        const messages = Array.from(fetched.values());
        before = messages[messages.length - 1]?.id;
        scanned += messages.length;

        const targets = messages.filter(
            (msg) => msg.author?.id === userId && msg.deletable !== false
        );

        if (targets.length) {
            deleted += await deleteMessageBatch(channel, targets);
        }

        if (onProgress) {
            await onProgress({ deleted, scanned });
        }

        if (scanned >= MAX_SCAN) {
            hitScanLimit = true;
            break;
        }
    }

    return { deleted, scanned, hitScanLimit };
}

module.exports = {
    purgeUserMessagesInChannel,
    MAX_SCAN
};
