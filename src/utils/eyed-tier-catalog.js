const {
    DEFAULT_LEVEL_TIERS,
    normalizeLevelTiers,
    tierForLevelFromTiers,
    formatLevelRange,
    tiersForEyedCatalog
} = require('./level-tier-defaults');

/** Rangos por defecto (sin config de guild). */
const EYED_LEVEL_TIERS = tiersForEyedCatalog(DEFAULT_LEVEL_TIERS);

function tierForLevel(level, guildTiers) {
    const tiers = guildTiers ? normalizeLevelTiers(guildTiers) : normalizeLevelTiers(DEFAULT_LEVEL_TIERS);
    const hit = tierForLevelFromTiers(level, tiers);
    if (!hit) return null;
    return {
        label: hit.name,
        minLevel: hit.minLevel,
        maxLevel: hit.maxLevel,
        description: ''
    };
}

function getEyedTiersForGuild(config) {
    return tiersForEyedCatalog(config?.tiers);
}

module.exports = {
    EYED_LEVEL_TIERS,
    formatLevelRange,
    tierForLevel,
    getEyedTiersForGuild,
    normalizeLevelTiers
};
