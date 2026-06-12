export type EmbedFieldForm = {
  name: string;
  value: string;
  inline: boolean;
};

export type EmbedFormState = {
  channelId: string;
  messageId: string;
  templateName: string;
  title: string;
  description: string;
  color: string;
  footer: string;
  authorName: string;
  authorIconUrl: string;
  authorUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  timestamp: boolean;
  fields: EmbedFieldForm[];
};

export const DEFAULT_EMBED_FORM: EmbedFormState = {
  channelId: "",
  messageId: "",
  templateName: "",
  title: "",
  description: "",
  color: "#8b5cf6",
  footer: "",
  authorName: "",
  authorIconUrl: "",
  authorUrl: "",
  imageUrl: "",
  thumbnailUrl: "",
  timestamp: false,
  fields: [],
};

export function normalizeHexColor(value: string, fallback = "#8b5cf6") {
  const raw = String(value || "").trim().replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((ch) => ch + ch)
      .join("");
    return `#${expanded.toLowerCase()}`;
  }
  return fallback;
}

export function hexToPlainColor(value: string, fallback = "8b5cf6") {
  return normalizeHexColor(value, `#${fallback}`).replace("#", "");
}

export function plainColorToHex(value: string, fallback = "7c4dff") {
  return normalizeHexColor(value.includes("#") ? value : `#${value}`, `#${fallback}`);
}

export function embedColorToNumber(color: string) {
  const hex = normalizeHexColor(color).replace("#", "");
  return Number.parseInt(hex, 16);
}

export function buildEmbedPayload(form: EmbedFormState) {
  const embed: Record<string, unknown> = {};

  if (form.title.trim()) embed.title = form.title.trim();
  if (form.description.trim()) embed.description = form.description.trim();
  if (form.color) embed.color = embedColorToNumber(form.color);
  if (form.footer.trim()) embed.footer = form.footer.trim();
  if (form.imageUrl.trim()) embed.image = form.imageUrl.trim();
  if (form.thumbnailUrl.trim()) embed.thumbnail = form.thumbnailUrl.trim();
  if (form.timestamp) embed.timestamp = true;

  if (form.authorName.trim()) {
    embed.author = {
      name: form.authorName.trim(),
      ...(form.authorIconUrl.trim() ? { iconURL: form.authorIconUrl.trim() } : {}),
      ...(form.authorUrl.trim() ? { url: form.authorUrl.trim() } : {}),
    };
  }

  const fields = form.fields
    .filter((field) => field.name.trim() && field.value.trim())
    .map((field) => ({
      name: field.name.trim(),
      value: field.value.trim(),
      inline: field.inline,
    }));

  if (fields.length) embed.fields = fields;

  return embed;
}

export function embedToFormState(embed: Record<string, unknown>, base: EmbedFormState = DEFAULT_EMBED_FORM): EmbedFormState {
  const author = embed.author && typeof embed.author === "object" ? (embed.author as Record<string, unknown>) : {};
  const color =
    typeof embed.color === "number"
      ? `#${embed.color.toString(16).padStart(6, "0")}`
      : normalizeHexColor(String(embed.color || base.color), base.color);

  return {
    ...base,
    title: String(embed.title || ""),
    description: String(embed.description || ""),
    color,
    footer: String(embed.footer || ""),
    authorName: String(author.name || ""),
    authorIconUrl: String(author.iconURL || author.iconUrl || ""),
    authorUrl: String(author.url || ""),
    imageUrl: String(embed.image || ""),
    thumbnailUrl: String(embed.thumbnail || ""),
    timestamp: embed.timestamp === true,
    fields: Array.isArray(embed.fields)
      ? embed.fields.map((entry) => {
          const field = entry as Record<string, unknown>;
          return {
            name: String(field.name || ""),
            value: String(field.value || ""),
            inline: field.inline === true,
          };
        })
      : [],
  };
}
