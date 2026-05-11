const gachaStore = require('./gacha-store');

const minigameCooldownMap = new Map();

function getMinigameReward(config, gameKey = '') {
    const key = String(gameKey || '').toLowerCase();
    if (key === 'coinflip') return Math.max(0, Number(config.minigameCoinflipReward || 0));
    if (key === 'dice') return Math.max(0, Number(config.minigameDiceReward || 0));
    if (key === 'trivia') return Math.max(0, Number(config.minigameTriviaReward || 0));
    return 0;
}

async function awardCoinsForXp(guildId, userId, xpAmount = 0) {
    const config = await gachaStore.getConfig(guildId);
    if (!config.economyEnabled) return null;

    const rate = Math.max(0, Number(config.coinsPerXp || 0));
    if (!rate) return null;

    const xp = Math.max(0, Number.parseInt(`${xpAmount || 0}`, 10) || 0);
    if (!xp) return null;

    const coins = Math.max(1, Math.floor(xp * rate));
    return gachaStore.addCoins(guildId, userId, coins);
}

async function awardCoinsForLevelUp(guildId, userId, oldLevel = 0, newLevel = 0) {
    const config = await gachaStore.getConfig(guildId);
    if (!config.economyEnabled) return null;

    const reward = Math.max(0, Number(config.coinsPerLevelUp || 0));
    if (!reward) return null;

    const gained = Math.max(0, Number(newLevel || 0) - Number(oldLevel || 0));
    if (!gained) return null;

    return gachaStore.addCoins(guildId, userId, reward * gained);
}

async function awardCoinsForVoiceMinute(guildId, userId) {
    const config = await gachaStore.getConfig(guildId);
    if (!config.economyEnabled) return null;

    const reward = Math.max(0, Number(config.coinsPerVoiceMinute || 0));
    if (!reward) return null;

    return gachaStore.addCoins(guildId, userId, reward);
}

async function awardMinigameCoins(guildId, userId, gameKey = '') {
    const config = await gachaStore.getConfig(guildId);
    if (!config.economyEnabled) return { ok: false, reason: 'economy_disabled' };

    const reward = getMinigameReward(config, gameKey);
    if (!reward) return { ok: false, reason: 'reward_disabled' };

    const cooldownMs = Math.max(5000, Number(config.minigameCooldownSec || 45) * 1000);
    const cooldownKey = `${guildId}:${userId}:${String(gameKey || '').toLowerCase()}`;
    const now = Date.now();
    const last = minigameCooldownMap.get(cooldownKey) || 0;
    if (now - last < cooldownMs) {
        return {
            ok: false,
            reason: 'cooldown',
            remainingMs: cooldownMs - (now - last)
        };
    }

    minigameCooldownMap.set(cooldownKey, now);
    const profile = await gachaStore.addCoins(guildId, userId, reward);
    return { ok: true, reward, profile };
}

module.exports = {
    awardCoinsForXp,
    awardCoinsForLevelUp,
    awardCoinsForVoiceMinute,
    awardMinigameCoins,
    getMinigameReward
};
