/**
 * Rangos de nivel por defecto y normalización (panel web + bot).
 */

const TIER_ICON_BY_ID = {
    iniciado: 'seed',
    explorador: 'compass',
    guardian: 'shield',
    nucleo: 'atom',
    arcano: 'diamond',
    leyenda: 'flame'
};

/** @type {Array<{ id: string, name: string, minLevel: number, color: string }>} */
const DEFAULT_LEVEL_TIERS = [
    { id: 'iniciado', name: 'Iniciado', minLevel: 1, color: '#94a3b8' },
    { id: 'explorador', name: 'Explorador', minLevel: 5, color: '#38bdf8' },
    { id: 'guardian', name: 'Guardián', minLevel: 15, color: '#a78bfa' },
    { id: 'nucleo', name: 'Núcleo', minLevel: 30, color: '#f472b6' },
    { id: 'arcano', name: 'Arcano', minLevel: 50, color: '#f59e0b' },
    { id: 'leyenda', name: 'Leyenda', minLevel: 75, color: '#ef4444' }
];

function slugTierId(name, index = 0) {
    const base = String(name || 'rango')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 32);
    return base || `rango_${index + 1}`;
}

function hexColorOrFallback(value, fallback = '#9a6dff') {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
    return fallback;
}

function accentFromColor(hex) {
    const color = hexColorOrFallback(hex);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.55)`;
}

function normalizeLevelTiers(rawTiers) {
    const source = Array.isArray(rawTiers) && rawTiers.length ? rawTiers : DEFAULT_LEVEL_TIERS;
    const sorted = source
        .map((tier, index) => {
            const name = String(tier?.name || tier?.label || `Rango ${index + 1}`).trim().slice(0, 40);
            const minLevel = Math.max(1, Math.min(5000, Number.parseInt(tier?.minLevel, 10) || 1));
            const color = hexColorOrFallback(tier?.color, DEFAULT_LEVEL_TIERS[index % DEFAULT_LEVEL_TIERS.length]?.color);
            const id = String(tier?.id || '').trim() || slugTierId(name, index);
            return { id, name, minLevel, color };
        })
        .sort((a, b) => a.minLevel - b.minLevel)
        .slice(0, 10);

    if (sorted.length < 2) {
        return normalizeLevelTiers(DEFAULT_LEVEL_TIERS);
    }

    sorted[0].minLevel = 1;

    const usedIds = new Set();
    const normalized = sorted.map((tier, index) => {
        let id = tier.id;
        let suffix = 2;
        while (usedIds.has(id)) {
            id = `${tier.id}_${suffix}`;
            suffix += 1;
        }
        usedIds.add(id);

        const next = sorted[index + 1];
        const maxLevel = next ? Math.max(tier.minLevel, next.minLevel - 1) : Infinity;
        const icon = TIER_ICON_BY_ID[id] || TIER_ICON_BY_ID[slugTierId(tier.name)] || 'seed';

        return {
            id,
            name: tier.name,
            minLevel: tier.minLevel,
            maxLevel,
            color: tier.color,
            accent: accentFromColor(tier.color),
            icon
        };
    });

    return normalized;
}

function tierForLevelFromTiers(level, tiers) {
    const list = normalizeLevelTiers(tiers);
    const lvl = Math.max(1, Number.parseInt(level, 10) || 1);
    for (const tier of list) {
        const max = tier.maxLevel === Infinity ? Number.POSITIVE_INFINITY : tier.maxLevel;
        if (lvl >= tier.minLevel && lvl <= max) return tier;
    }
    return list[list.length - 1] || list[0];
}

function formatLevelRange(tier) {
    const min = Math.max(1, Number.parseInt(tier?.minLevel, 10) || 1);
    const max = tier?.maxLevel;
    if (max === Infinity || max >= 99999) return `Nv ${min}+`;
    return `Nv ${min}–${max}`;
}

function tiersForEyedCatalog(tiers) {
    return normalizeLevelTiers(tiers).map((tier) => ({
        label: tier.name,
        minLevel: tier.minLevel,
        maxLevel: tier.maxLevel,
        description: ''
    }));
}

module.exports = {
    DEFAULT_LEVEL_TIERS,
    TIER_ICON_BY_ID,
    normalizeLevelTiers,
    tierForLevelFromTiers,
    formatLevelRange,
    tiersForEyedCatalog,
    hexColorOrFallback,
    slugTierId
};
