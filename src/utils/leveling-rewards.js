/**
 * Recompensas por nivel (roles). Usado por leveling-tracker y comandos /nivel.
 */

function parseRoleRewards(rawRewards) {
    if (!Array.isArray(rawRewards)) return [];
    return rawRewards
        .map((reward) => ({
            level: Math.max(1, Number.parseInt(reward?.level, 10) || 1),
            roleId: String(reward?.roleId || '').trim()
        }))
        .filter((reward) => reward.roleId)
        .sort((a, b) => a.level - b.level);
}

/**
 * @param {number} userLevel
 * @param {Array<{ level: number, roleId: string }>} sortedRewards resultado de parseRoleRewards
 * @returns {{ current: { level: number, roleId: string } | null, next: { level: number, roleId: string } | null }}
 */
function getRoleRewardTiersForLevel(userLevel, sortedRewards) {
    const level = Math.max(0, Number.parseInt(userLevel, 10) || 0);
    if (!sortedRewards.length) {
        return { current: null, next: null };
    }
    const unlocked = sortedRewards.filter((r) => level >= r.level);
    const current = unlocked.length ? unlocked[unlocked.length - 1] : null;
    const next = sortedRewards.find((r) => r.level > level) || null;
    return { current, next };
}

module.exports = {
    parseRoleRewards,
    getRoleRewardTiersForLevel
};
