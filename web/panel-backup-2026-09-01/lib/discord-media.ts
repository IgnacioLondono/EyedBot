export function discordAvatarUrl(userId: string, avatar?: string | null, size = 128) {
  const id = String(userId || "").trim();
  if (!id) return "https://cdn.discordapp.com/embed/avatars/0.png";

  const raw = String(avatar || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw) {
    const ext = raw.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${raw}.${ext}?size=${size}`;
  }

  try {
    const index = Number(BigInt(id) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export function discordGuildIconUrl(guildId: string, icon?: string | null, size = 128) {
  const id = String(guildId || "").trim();
  const raw = String(icon || "").trim();
  if (!id || !raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;

  return `https://cdn.discordapp.com/icons/${id}/${raw}.png?size=${size}`;
}
