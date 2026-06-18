export const WELCOME_CARD_WIDTH = 920;
export const WELCOME_CARD_HEIGHT = 520;

export type WelcomeCardLayout = {
  bgFocalX: number;
  bgFocalY: number;
  avatarCx: number;
  avatarCy: number;
  avatarR: number;
  titleX: number;
  titleY: number;
  nameX: number;
  nameY: number;
  subtitleX: number;
  subtitleY: number;
  overlayX: number;
  overlayY: number;
};

export const DEFAULT_WELCOME_CARD_LAYOUT: WelcomeCardLayout = {
  bgFocalX: 0.5,
  bgFocalY: 0.5,
  avatarCx: 460,
  avatarCy: 168,
  avatarR: 78,
  titleX: 460,
  titleY: 262,
  nameX: 460,
  nameY: 320,
  subtitleX: 460,
  subtitleY: 368,
  overlayX: 892,
  overlayY: 498,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function mergeWelcomeCardLayout(raw?: Partial<WelcomeCardLayout> | null): WelcomeCardLayout {
  const d = { ...DEFAULT_WELCOME_CARD_LAYOUT };
  if (!raw || typeof raw !== "object") return d;

  const num = (v: unknown, def: number, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? clamp(x, min, max) : def;
  };

  return {
    bgFocalX: num(raw.bgFocalX, d.bgFocalX, 0, 1),
    bgFocalY: num(raw.bgFocalY, d.bgFocalY, 0, 1),
    avatarCx: num(raw.avatarCx, d.avatarCx, 0, WELCOME_CARD_WIDTH),
    avatarCy: num(raw.avatarCy, d.avatarCy, 0, WELCOME_CARD_HEIGHT),
    avatarR: num(raw.avatarR, d.avatarR, 36, 150),
    titleX: num(raw.titleX, d.titleX, 0, WELCOME_CARD_WIDTH),
    titleY: num(raw.titleY, d.titleY, 0, WELCOME_CARD_HEIGHT),
    nameX: num(raw.nameX, d.nameX, 0, WELCOME_CARD_WIDTH),
    nameY: num(raw.nameY, d.nameY, 0, WELCOME_CARD_HEIGHT),
    subtitleX: num(raw.subtitleX, d.subtitleX, 0, WELCOME_CARD_WIDTH),
    subtitleY: num(raw.subtitleY, d.subtitleY, 0, WELCOME_CARD_HEIGHT),
    overlayX: num(raw.overlayX, d.overlayX, 0, WELCOME_CARD_WIDTH),
    overlayY: num(raw.overlayY, d.overlayY, 0, WELCOME_CARD_HEIGHT),
  };
}

export const WELCOME_FONT_OPTIONS = [
  { value: "system", label: "Sistema" },
  { value: "serif", label: "Serif (Georgia)" },
  { value: "mono", label: "Monoespaciada" },
  { value: "rounded", label: "Redondeada (Verdana)" },
  { value: "elegant", label: "Elegante (Times)" },
  { value: "impact", label: "Impacto (Impact)" },
  { value: "trebuchet", label: "Trebuchet MS" },
] as const;

export type WelcomeFontKey = (typeof WELCOME_FONT_OPTIONS)[number]["value"];

export type WelcomeCardPreviewInput = {
  title: string;
  message: string;
  imageUrl: string;
  cardNameTemplate: string;
  cardOverlayText: string;
  cardAccentColor: string;
  cardTitleColor: string;
  cardNameColor: string;
  cardSubtitleColor: string;
  cardOverlayColor: string;
  cardFontKey: string;
  cardLayout: WelcomeCardLayout;
};

export function buildWelcomeCardPreviewBody(config: WelcomeCardPreviewInput) {
  return {
    title: config.title,
    message: config.message,
    imageUrl: config.imageUrl,
    cardNameTemplate: config.cardNameTemplate,
    cardOverlayText: config.cardOverlayText,
    cardAccentColor: config.cardAccentColor,
    cardTitleColor: config.cardTitleColor,
    cardNameColor: config.cardNameColor,
    cardSubtitleColor: config.cardSubtitleColor,
    cardOverlayColor: config.cardOverlayColor,
    cardFontKey: config.cardFontKey,
    cardLayout: config.cardLayout,
  };
}
