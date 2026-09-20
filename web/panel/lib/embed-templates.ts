export type EmbedTemplateSlot = "avatar" | "image" | "thumbnail";

export type EmbedTemplateDef = {
  id: string;
  label: string;
  description: string;
  slots: EmbedTemplateSlot[];
};

export const EMBED_TEMPLATES: EmbedTemplateDef[] = [
  {
    id: "classic",
    label: "Clásica",
    description: "Título, texto y barra de color lateral. Sin imágenes.",
    slots: [],
  },
  {
    id: "avatar",
    label: "Avatar",
    description: "Miniatura con el avatar del usuario en la esquina superior.",
    slots: ["avatar"],
  },
  {
    id: "banner",
    label: "Banner",
    description: "Imagen destacada al pie del embed.",
    slots: ["image"],
  },
  {
    id: "avatar-banner",
    label: "Avatar + Banner",
    description: "Avatar del usuario como miniatura e imagen destacada al pie.",
    slots: ["avatar", "image"],
  },
  {
    id: "sidebar",
    label: "Barra lateral",
    description: "Miniatura personalizada (logo o emblema) y barra de acento de color.",
    slots: ["thumbnail"],
  },
];

export const EMBED_TEMPLATE_IDS = EMBED_TEMPLATES.map((tpl) => tpl.id);

export function getEmbedTemplateDef(id?: string | null): EmbedTemplateDef | null {
  if (!id) return null;
  return EMBED_TEMPLATES.find((tpl) => tpl.id === id) || null;
}

export function getEmbedTemplateSlots(id?: string | null): EmbedTemplateSlot[] {
  return getEmbedTemplateDef(id)?.slots.slice() || [];
}

export function hasEmbedTemplateSlot(id: string | null | undefined, slot: EmbedTemplateSlot) {
  return getEmbedTemplateSlots(id).includes(slot);
}