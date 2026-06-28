export type TicketOptionPreset = {
  value: string;
  label: string;
  description: string;
};

export type TicketPreset = {
  id: string;
  name: string;
  description: string;
  color: string;
  title: string;
  message: string;
  buttonLabel: string;
  footer: string;
  ticketCategories: TicketOptionPreset[];
  commonProblems: TicketOptionPreset[];
  sendDmReceipt?: boolean;
  sendDmPendingStatus?: boolean;
};

export const TICKET_PRESETS: TicketPreset[] = [
  {
    id: "support-general",
    name: "Soporte general",
    description: "Panel clásico para consultas y ayuda del servidor.",
    color: "7c4dff",
    title: "Centro de Soporte",
    message:
      "¿Necesitas ayuda? Pulsa el botón y un miembro del staff te atenderá lo antes posible.\n\n**Antes de abrir:** revisa las reglas y los canales de información.",
    buttonLabel: "Abrir ticket",
    footer: "EyedBot · Soporte",
    ticketCategories: [
      { value: "general", label: "Consulta general", description: "Dudas sobre el servidor" },
      { value: "tecnico", label: "Problema técnico", description: "Errores, bugs o fallos" },
      { value: "sugerencia", label: "Sugerencia", description: "Ideas para mejorar la comunidad" },
    ],
    commonProblems: [
      { value: "acceso", label: "No puedo acceder", description: "Permisos o canales bloqueados" },
      { value: "cuenta", label: "Problema de cuenta", description: "Verificación, nick o perfil" },
      { value: "otro", label: "Otro motivo", description: "Describe tu caso con detalle" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "eyedbio",
    name: "Eyed.bio",
    description: "Soporte para perfiles link-in-bio, widgets de Discord y cuenta.",
    color: "00c2a8",
    title: "Soporte Eyed.bio",
    message:
      "¿Problemas con tu perfil en **Eyed.bio**? Abre un ticket e indica tu **usuario** o enlace del perfil.\n\nPara la presencia de Discord en el perfil, debes estar en EyedComun y tener configurado tu ID.",
    buttonLabel: "Ayuda Eyed.bio",
    footer: "EyedBot · Eyed.bio",
    ticketCategories: [
      { value: "perfil", label: "Mi perfil", description: "Enlaces, tema o diseño del perfil" },
      { value: "discord-widget", label: "Widget Discord", description: "Presencia, estado o actividad" },
      { value: "cuenta", label: "Cuenta / acceso", description: "Login o vinculación de Discord" },
    ],
    commonProblems: [
      { value: "no-carga", label: "No carga el perfil", description: "Página en blanco o error al abrir" },
      { value: "discord-offline", label: "Discord sale offline", description: "El widget no muestra estado" },
      { value: "vincular-discord", label: "Vincular Discord", description: "Conectar cuenta con EyedBot" },
      { value: "otro", label: "Otro", description: "Describe tu caso con detalle" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "shop",
    name: "Tienda / Compras",
    description: "Tickets para pagos, entregas y soporte de la tienda.",
    color: "f5a623",
    title: "Soporte de Tienda",
    message:
      "¿Problemas con una compra o entrega? Abre un ticket y adjunta el **comprobante** o ID de pedido si lo tienes.",
    buttonLabel: "Soporte tienda",
    footer: "EyedBot · Tienda",
    ticketCategories: [
      { value: "compra", label: "Compra / pago", description: "Problemas al pagar o confirmar" },
      { value: "entrega", label: "Entrega pendiente", description: "Producto no recibido" },
      { value: "reembolso", label: "Reembolso", description: "Solicitud de devolución" },
    ],
    commonProblems: [
      { value: "no-llego", label: "No recibí mi producto", description: "Entrega retrasada o fallida" },
      { value: "cargo-duplicado", label: "Cargo duplicado", description: "Cobro repetido" },
      { value: "producto-incorrecto", label: "Producto incorrecto", description: "Recibiste otra cosa" },
      { value: "otro", label: "Otro", description: "Consulta general de tienda" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: false,
  },
  {
    id: "reports",
    name: "Reportes / Moderación",
    description: "Canal de denuncias con categorías para staff.",
    color: "ed4245",
    title: "Reportes y Denuncias",
    message:
      "Usa este panel solo para **reportes serios**. Incluye pruebas (capturas, IDs o enlaces) para agilizar la revisión.",
    buttonLabel: "Enviar reporte",
    footer: "EyedBot · Moderación",
    ticketCategories: [
      { value: "usuario", label: "Reporte de usuario", description: "Conducta inapropiada" },
      { value: "spam", label: "Spam / raid", description: "Mensajes masivos o bots" },
      { value: "contenido", label: "Contenido prohibido", description: "NSFW, odio o ilegal" },
    ],
    commonProblems: [
      { value: "acoso", label: "Acoso o amenazas", description: "DMs o menciones abusivas" },
      { value: "suplantacion", label: "Suplantación", description: "Fingir ser otra persona" },
      { value: "otro", label: "Otro incidente", description: "Describe lo ocurrido" },
    ],
    sendDmReceipt: false,
    sendDmPendingStatus: true,
  },
  {
    id: "staff-apps",
    name: "Postulaciones staff",
    description: "Formulario guiado para candidatos a moderación.",
    color: "5865f2",
    title: "Postulaciones Staff",
    message:
      "¿Quieres unirte al equipo? Abre un ticket y cuéntanos tu experiencia, zona horaria y motivación.\n\nSolo revisamos postulaciones completas.",
    buttonLabel: "Postularme",
    footer: "EyedBot · Staff",
    ticketCategories: [
      { value: "moderacion", label: "Moderación", description: "Chat y comunidad" },
      { value: "soporte", label: "Soporte", description: "Atención a usuarios" },
      { value: "eventos", label: "Eventos", description: "Organización de actividades" },
    ],
    commonProblems: [
      { value: "primera-vez", label: "Primera postulación", description: "Nunca fuiste staff" },
      { value: "experiencia", label: "Con experiencia previa", description: "Ya moderaste otros servidores" },
      { value: "otro", label: "Otra área", description: "Especifica en el ticket" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
];

export type TicketConfigLike = {
  title: string;
  message: string;
  buttonLabel: string;
  color: string;
  footer: string;
  ticketCategories: TicketOptionPreset[];
  commonProblems: TicketOptionPreset[];
  sendDmReceipt: boolean;
  sendDmPendingStatus: boolean;
};

/** Aplica una plantilla conservando canales, roles y demás ajustes del servidor. */
export function applyTicketPreset<T extends TicketConfigLike>(
  preset: TicketPreset,
  current: T
): T {
  return {
    ...current,
    title: preset.title,
    message: preset.message,
    buttonLabel: preset.buttonLabel,
    color: preset.color.replace("#", ""),
    footer: preset.footer,
    ticketCategories: preset.ticketCategories.map((item) => ({ ...item })),
    commonProblems: preset.commonProblems.map((item) => ({ ...item })),
    sendDmReceipt: preset.sendDmReceipt ?? current.sendDmReceipt,
    sendDmPendingStatus: preset.sendDmPendingStatus ?? current.sendDmPendingStatus,
  };
}
