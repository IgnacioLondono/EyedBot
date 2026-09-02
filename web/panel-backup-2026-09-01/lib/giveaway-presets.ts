export type GiveawayPreset = {
  id: string;
  name: string;
  description: string;
  title: string;
  prize: string;
  giveawayDescription: string;
  durationMinutes: number;
  winnersCount: number;
};

export const GIVEAWAY_DURATION_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "30 min", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "6 horas", minutes: 360 },
  { label: "12 horas", minutes: 720 },
  { label: "1 día", minutes: 1440 },
  { label: "3 días", minutes: 4320 },
  { label: "1 semana", minutes: 10080 },
];

export const GIVEAWAY_PRESETS: GiveawayPreset[] = [
  {
    id: "nitro",
    name: "Nitro Discord",
    description: "Sorteo clásico de suscripción Nitro.",
    title: "Sorteo Nitro",
    prize: "1 mes de Discord Nitro",
    giveawayDescription: "Participa con el botón de abajo. El ganador será mencionado al finalizar.",
    durationMinutes: 1440,
    winnersCount: 1,
  },
  {
    id: "coins",
    name: "Monedas / Economía",
    description: "Premio en monedas del bot o economía del servidor.",
    title: "Sorteo de monedas",
    prize: "10.000 monedas",
    giveawayDescription: "Requisito: estar en el servidor. ¡Suerte a todos!",
    durationMinutes: 360,
    winnersCount: 3,
  },
  {
    id: "role-vip",
    name: "Rol VIP",
    description: "Entrega de rol exclusivo temporal o permanente.",
    title: "Sorteo VIP",
    prize: "Rol VIP por 30 días",
    giveawayDescription: "El rol se asignará manualmente tras el sorteo.",
    durationMinutes: 720,
    winnersCount: 2,
  },
  {
    id: "game-key",
    name: "Key / Steam",
    description: "Plantilla para keys de juegos o gift cards.",
    title: "Sorteo de juego",
    prize: "1 key de Steam",
    giveawayDescription: "Verifica que tu DM esté abierto para recibir el premio.",
    durationMinutes: 4320,
    winnersCount: 1,
  },
  {
    id: "community",
    name: "Comunidad rápida",
    description: "Sorteo corto para engagement diario.",
    title: "Sorteo express",
    prize: "Mención destacada + premio sorpresa",
    giveawayDescription: "Duración corta. Pulsa **Participar** antes de que cierre.",
    durationMinutes: 60,
    winnersCount: 1,
  },
  {
    id: "milestone",
    name: "Hito del servidor",
    description: "Celebración por miembros o aniversario.",
    title: "¡Gracias por los {members} miembros!",
    prize: "Pack de premios sorpresa",
    giveawayDescription: "Celebramos un nuevo hito de la comunidad. ¡Gracias por formar parte!",
    durationMinutes: 10080,
    winnersCount: 5,
  },
];

export type GiveawayFormLike = {
  title: string;
  prize: string;
  description: string;
  durationMinutes: number;
  winnersCount: number;
};

export function applyGiveawayPreset<T extends GiveawayFormLike>(
  preset: GiveawayPreset,
  current: T
): T {
  return {
    ...current,
    title: preset.title,
    prize: preset.prize,
    description: preset.giveawayDescription,
    durationMinutes: preset.durationMinutes,
    winnersCount: preset.winnersCount,
  };
}

export function formatGiveawayDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem ? `${hours} h ${rem} min` : `${hours} h`;
  }
  const days = Math.floor(minutes / 1440);
  const remHours = Math.floor((minutes % 1440) / 60);
  return remHours ? `${days} d ${remHours} h` : `${days} d`;
}

export function giveawayStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Activo";
    case "ended":
      return "Finalizado";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

export function giveawayStatusVariant(status: string): "success" | "default" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "default";
  }
}
