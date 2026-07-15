/** GIFs de la landing vía proxy del backend (nekos.best / otakugifs). */
export const SHOWCASE_ANIME_GIFS = {
  hug: "/api/showcase/gif/hug",
  pat: "/api/showcase/gif/pat",
  kiss: "/api/showcase/gif/kiss",
} as const;

export type ShowcaseInteractionKey = keyof typeof SHOWCASE_ANIME_GIFS;

export const SHOWCASE_INTERACTIONS = [
  {
    key: "hug" as const,
    command: "/hug",
    title: "🤗 Abrazo",
    verb: "abrazó",
    countLabel: "Veces abrazado",
    count: 42,
    gif: SHOWCASE_ANIME_GIFS.hug,
  },
  {
    key: "pat" as const,
    command: "/pat",
    title: "👋 Caricia",
    verb: "acarició",
    countLabel: "Veces acariciado",
    count: 18,
    gif: SHOWCASE_ANIME_GIFS.pat,
  },
  {
    key: "kiss" as const,
    command: "/kiss",
    title: "💋 Beso",
    verb: "besó",
    countLabel: "Veces besado",
    count: 7,
    gif: SHOWCASE_ANIME_GIFS.kiss,
  },
] as const;
