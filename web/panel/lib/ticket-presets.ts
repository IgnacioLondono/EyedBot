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
  /** Categorías de título (menú principal del ticket). */
  ticketCategories: TicketOptionPreset[];
  commonProblems: TicketOptionPreset[];
  sendDmReceipt?: boolean;
  sendDmPendingStatus?: boolean;
};

/** Plantillas listas para el owner: categorías de título + problemas, sin Áreas Eyed.bio. */
export const TICKET_PRESETS: TicketPreset[] = [
  {
    id: "owner-comunidad",
    name: "Comunidad (owner)",
    description: "Plantilla base del owner: categorías de título claras para soporte, reportes y sugerencias.",
    color: "7c4dff",
    title: "Centro de Soporte",
    message:
      "Bienvenido al **centro de soporte**.\n\n" +
      "1. Elige la **categoría** que mejor describa tu caso.\n" +
      "2. Indica el **motivo** en el menú siguiente.\n" +
      "3. Si te lo pedimos, adjunta **capturas** o enlaces útiles.\n\n" +
      "El staff responde según disponibilidad; evita abrir tickets duplicados.",
    buttonLabel: "Abrir ticket",
    footer: "Sistema de Tickets",
    ticketCategories: [
      { value: "soporte", label: "Soporte general", description: "Dudas sobre el servidor y la comunidad" },
      { value: "tecnico", label: "Problema técnico", description: "Errores, bugs o fallos del bot" },
      { value: "reportes", label: "Reportes", description: "Denuncias, spam o apelaciones" },
      { value: "sugerencias", label: "Sugerencias", description: "Ideas para mejorar la comunidad" },
      { value: "colaboraciones", label: "Colaboraciones", description: "Alianzas, creadores o marcas" },
    ],
    commonProblems: [
      { value: "permisos", label: "Permisos o acceso", description: "Canales, roles o verificación" },
      { value: "verificacion", label: "Verificación", description: "Rol de miembro verificado" },
      { value: "errores-bot", label: "Error del bot", description: "Comandos o panel no responden" },
      { value: "sanciones", label: "Sanción o apelación", description: "Mute, kick o ban" },
      { value: "otro", label: "Otro motivo", description: "Describe tu caso con detalle" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "support-general",
    name: "Soporte general",
    description: "Panel clásico ampliado para consultas, permisos y orientación.",
    color: "5865f2",
    title: "Centro de Soporte",
    message:
      "¿Necesitas ayuda en el servidor? Pulsa el botón y el staff te atenderá.\n\n" +
      "**Antes de abrir:** revisa las reglas, los canales de información y las preguntas frecuentes.\n" +
      "Incluye capturas si reportas un error técnico.",
    buttonLabel: "Abrir ticket",
    footer: "EyedBot · Soporte",
    ticketCategories: [
      { value: "consulta", label: "Consulta general", description: "Dudas sobre el servidor o normas" },
      { value: "tecnico", label: "Problema técnico", description: "Errores, bugs o fallos de Discord/bot" },
      { value: "verificacion", label: "Verificación", description: "Acceso, rol verificado o onboarding" },
      { value: "roles", label: "Roles y permisos", description: "Canales bloqueados o roles incorrectos" },
      { value: "sugerencia", label: "Sugerencia", description: "Ideas para mejorar la comunidad" },
    ],
    commonProblems: [
      { value: "acceso", label: "No puedo acceder", description: "Canales o secciones bloqueadas" },
      { value: "verificacion", label: "Verificación pendiente", description: "No recibí el rol esperado" },
      { value: "cuenta", label: "Problema de cuenta", description: "Nick, perfil o configuración" },
      { value: "bot-caido", label: "El bot no responde", description: "Comandos sin respuesta" },
      { value: "otro", label: "Otro motivo", description: "Describe tu caso con detalle" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "eyedbot",
    name: "EyedBot / Panel",
    description: "Soporte del bot, panel web, módulos y EyedPlus+.",
    color: "9b59b6",
    title: "Soporte EyedBot",
    message:
      "¿Necesitas ayuda con **EyedBot** o el **panel web**?\n\n" +
      "Indica el **servidor**, el **módulo** (tickets, welcome, música, etc.) y qué esperabas que ocurriera.\n" +
      "Si es sobre **EyedPlus+**, adjunta comprobante de pago si aplica.",
    buttonLabel: "Soporte EyedBot",
    footer: "EyedBot · Panel",
    ticketCategories: [
      { value: "comandos", label: "Comandos", description: "Slash, prefijo o permisos" },
      { value: "panel-web", label: "Panel web", description: "Login, configuración o publicación" },
      { value: "musica", label: "Música", description: "Reproducción, cola o Lavalink" },
      { value: "modulos", label: "Módulos", description: "Tickets, niveles, gacha, welcome, etc." },
      { value: "eyedplus", label: "EyedPlus+", description: "Suscripción y funciones premium" },
    ],
    commonProblems: [
      { value: "no-responde", label: "El bot no responde", description: "Sin respuesta a comandos" },
      { value: "sin-permisos", label: "Sin permisos", description: "El bot no puede actuar en un canal" },
      { value: "panel-login", label: "No puedo entrar al panel", description: "OAuth o sesión del dashboard" },
      { value: "config-no-guarda", label: "La config no se guarda", description: "Cambios que no persisten" },
      { value: "premium", label: "EyedPlus+ no activo", description: "Pagaste pero sin acceso Pro" },
      { value: "otro", label: "Otro", description: "Describe el problema" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "shop",
    name: "Tienda / Pagos",
    description: "Compras, entregas, reembolsos y facturación.",
    color: "f5a623",
    title: "Soporte de Pagos",
    message:
      "¿Problemas con una **compra** o **suscripción**?\n\n" +
      "Adjunta **comprobante**, ID de pedido, correo de pago y fecha aproximada.\n" +
      "No compartas datos bancarios completos en el ticket.",
    buttonLabel: "Soporte de pagos",
    footer: "EyedBot · Pagos",
    ticketCategories: [
      { value: "compra", label: "Compra / pago", description: "Error al pagar o confirmar" },
      { value: "entrega", label: "Entrega pendiente", description: "Producto o rol no recibido" },
      { value: "reembolso", label: "Reembolso", description: "Devolución o cancelación" },
      { value: "facturacion", label: "Facturación", description: "Cargo duplicado o monto incorrecto" },
      { value: "suscripcion", label: "Suscripción", description: "Renovación, baja o cambio de plan" },
    ],
    commonProblems: [
      { value: "no-llego", label: "No recibí mi producto", description: "Entrega retrasada o fallida" },
      { value: "cargo-duplicado", label: "Cargo duplicado", description: "Cobro repetido en el mismo periodo" },
      { value: "producto-incorrecto", label: "Producto incorrecto", description: "Recibiste otra cosa" },
      { value: "cancelar", label: "Cancelar suscripción", description: "Baja de plan recurrente" },
      { value: "otro", label: "Otro", description: "Consulta general de pagos" },
    ],
    sendDmReceipt: true,
    sendDmPendingStatus: false,
  },
  {
    id: "staff-apply",
    name: "Postulación staff",
    description: "Formulario de solicitud para unirse al equipo.",
    color: "2ecc71",
    title: "Postulación al Staff",
    message:
      "¿Quieres formar parte del **staff**?\n\n" +
      "Elige el área, cuéntanos tu experiencia y disponibilidad.\n" +
      "Sé honesto: revisamos cada solicitud con calma.",
    buttonLabel: "Postularme",
    footer: "EyedBot · Staff",
    ticketCategories: [
      { value: "moderacion", label: "Moderación", description: "Chat, reglas y convivencia" },
      { value: "soporte", label: "Soporte", description: "Atención a usuarios y tickets" },
      { value: "eventos", label: "Eventos", description: "Organización de actividades" },
      { value: "staff-contenido", label: "Contenido", description: "Redes, anuncios o creatividad" },
      { value: "staff-tecnico", label: "Técnico / bot", description: "Ayuda con EyedBot o integraciones" },
    ],
    commonProblems: [
      { value: "primera-vez", label: "Primera postulación", description: "Nunca fuiste staff" },
      { value: "experiencia", label: "Con experiencia previa", description: "Ya moderaste otros servidores" },
      { value: "bilingue", label: "Staff bilingüe", description: "Inglés u otros idiomas" },
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
  supportAreas?: TicketOptionPreset[];
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
    supportAreas: [],
    sendDmReceipt: preset.sendDmReceipt ?? current.sendDmReceipt,
    sendDmPendingStatus: preset.sendDmPendingStatus ?? current.sendDmPendingStatus,
  };
}
