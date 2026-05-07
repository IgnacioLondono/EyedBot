function sanitizeDifficulty(raw = {}) {
    const baseXp = Math.max(50, Math.min(5000, Number.parseInt(raw.baseXp ?? 280, 10) || 280));
    const exponentRaw = Number.parseFloat(raw.exponent ?? 2.08);
    const exponent = Number.isFinite(exponentRaw) ? Math.max(1.2, Math.min(3.5, exponentRaw)) : 2.08;
    return { baseXp, exponent };
}

function xpForLevel(level, difficulty) {
    const safeLevel = Math.max(1, Number.parseInt(level, 10) || 1);
    const safeDiff = sanitizeDifficulty(difficulty);
    return Math.floor(safeDiff.baseXp * Math.pow(safeLevel, safeDiff.exponent));
}

function totalXpForLevel(level, difficulty) {
    const safeLevel = Math.max(0, Number.parseInt(level, 10) || 0);
    let total = 0;
    for (let current = 1; current <= safeLevel; current += 1) {
        total += xpForLevel(current, difficulty);
    }
    return total;
}

function getLevelFromXp(totalXp, difficulty) {
    const safeXp = Math.max(0, Number.parseInt(totalXp, 10) || 0);
    let level = 0;
    let accumulated = 0;

    while (true) {
        const nextNeed = xpForLevel(level + 1, difficulty);
        if (accumulated + nextNeed > safeXp) break;
        accumulated += nextNeed;
        level += 1;
        if (level >= 5000) break;
    }

    return level;
}

function getProgress(totalXp, difficulty) {
    const level = getLevelFromXp(totalXp, difficulty);
    const currentLevelBase = totalXpForLevel(level, difficulty);
    const nextNeed = xpForLevel(level + 1, difficulty);
    const intoLevel = Math.max(0, (Number.parseInt(totalXp, 10) || 0) - currentLevelBase);
    const percent = nextNeed > 0 ? Math.min(100, Math.max(0, Math.round((intoLevel / nextNeed) * 100))) : 100;

    return {
        level,
        intoLevel,
        nextNeed,
        percent
    };
}

module.exports = {
    sanitizeDifficulty,
    xpForLevel,
    totalXpForLevel,
    getLevelFromXp,
    getProgress
};
