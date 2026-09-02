export type LevelDifficulty = {
  baseXp: number;
  exponent: number;
};

export const LEVEL_CURVE_PRESETS: Array<LevelDifficulty & { id: string; name: string; description: string }> = [
  { id: "casual", name: "Casual", baseXp: 120, exponent: 1.6, description: "Progresión amable para comunidades nuevas." },
  { id: "balanced", name: "Equilibrado", baseXp: 200, exponent: 1.95, description: "Balance recomendado entre accesibilidad y reto." },
  { id: "challenging", name: "Exigente", baseXp: 280, exponent: 2.2, description: "Niveles altos requieren actividad sostenida." },
  { id: "odyssey", name: "Odisea", baseXp: 400, exponent: 2.45, description: "Curva larga para servidores muy activos." },
];

export function sanitizeDifficulty(raw: Partial<LevelDifficulty> = {}): LevelDifficulty {
  const baseXp = Math.max(50, Math.min(5000, Number.parseInt(String(raw.baseXp ?? 280), 10) || 280));
  const exponentRaw = Number.parseFloat(String(raw.exponent ?? 2.08));
  const exponent = Number.isFinite(exponentRaw) ? Math.max(1.2, Math.min(3.5, exponentRaw)) : 2.08;
  return { baseXp, exponent };
}

export function sanitizeXpMultiplier(raw: unknown) {
  const parsed = Number.parseFloat(String(raw ?? 1));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(20, Math.max(0.5, Math.round(parsed * 100) / 100));
}

export function xpForLevel(level: number, difficulty: LevelDifficulty) {
  const safeLevel = Math.max(1, Number.parseInt(String(level), 10) || 1);
  const safeDiff = sanitizeDifficulty(difficulty);
  return Math.floor(safeDiff.baseXp * Math.pow(safeLevel, safeDiff.exponent));
}

export function totalXpForLevel(level: number, difficulty: LevelDifficulty) {
  const safeLevel = Math.max(0, Number.parseInt(String(level), 10) || 0);
  let total = 0;
  for (let current = 1; current <= safeLevel; current += 1) {
    total += xpForLevel(current, difficulty);
  }
  return total;
}

export function getProgress(totalXp: number, difficulty: LevelDifficulty) {
  const safeXp = Math.max(0, Number.parseInt(String(totalXp), 10) || 0);
  let level = 0;
  let accumulated = 0;

  while (level < 5000) {
    const nextNeed = xpForLevel(level + 1, difficulty);
    if (accumulated + nextNeed > safeXp) break;
    accumulated += nextNeed;
    level += 1;
  }

  const intoLevel = Math.max(0, safeXp - totalXpForLevel(level, difficulty));
  const nextNeed = xpForLevel(level + 1, difficulty);
  const percent = nextNeed > 0 ? Math.min(100, Math.max(0, Math.round((intoLevel / nextNeed) * 100))) : 100;

  return { level, intoLevel, nextNeed, percent };
}

export function buildLevelMilestones(difficulty: LevelDifficulty, levels = [5, 10, 15, 25, 50, 75]) {
  return levels.map((level) => ({
    level,
    xpNeeded: xpForLevel(level, difficulty),
    totalXp: totalXpForLevel(level, difficulty),
  }));
}
