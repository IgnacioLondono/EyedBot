/**
 * Rangos Eyed alineados con LEVEL_TIERS del panel web (web/public/app.js).
 * Un solo origen conceptual; si cambias rangos en el panel, actualiza aquí también.
 */

function formatLevelRange(tier) {
    const min = Math.max(1, Number.parseInt(tier.minLevel, 10) || 1);
    const max = tier.maxLevel;
    if (max === Infinity || max >= 99999) return `Nv ${min}+`;
    return `Nv ${min}–${max}`;
}

/** @type {Array<{ label: string, minLevel: number, maxLevel: number, description: string }>} */
const EYED_LEVEL_TIERS = [
    {
        label: 'Iniciado',
        minLevel: 1,
        maxLevel: 4,
        description:
            'Primeros pasos en la comunidad. Ideal para conocer el servidor y ganar confianza con el grupo.'
    },
    {
        label: 'Explorador',
        minLevel: 5,
        maxLevel: 14,
        description:
            'Ya recorres el servidor con más soltura. Participás en conversaciones y descubrís dinámicas.'
    },
    {
        label: 'Guardián',
        minLevel: 15,
        maxLevel: 29,
        description:
            'Miembro consistente: tu presencia suma estabilidad al servidor en chat y actividades.'
    },
    {
        label: 'Núcleo',
        minLevel: 30,
        maxLevel: 49,
        description:
            'Formás parte central de la comunidad: referencia para otros y participación fuerte.'
    },
    {
        label: 'Arcano',
        minLevel: 50,
        maxLevel: 74,
        description:
            'Veterano de élite con trayectoria larga. Reconocimiento por dedicación y experiencia.'
    },
    {
        label: 'Leyenda',
        minLevel: 75,
        maxLevel: Infinity,
        description:
            'Presencia mítica: máximo tramo del sistema de niveles Eyed. Símbolo de la comunidad.'
    }
];

module.exports = {
    EYED_LEVEL_TIERS,
    formatLevelRange
};
