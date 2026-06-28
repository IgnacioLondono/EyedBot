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
  supportAreas?: TicketOptionPreset[];
  sendDmReceipt?: boolean;
  sendDmPendingStatus?: boolean;
};

export const TICKET_PRESETS: TicketPreset[] = [
  {
    id: "eyedcomun",
    name: "EyedComun (completo)",
    description: "Plantilla integral para la comunidad: Eyed.bio, EyedBot, EyedPlus+ y soporte general.",
    color: "7c4dff",
    title: "Centro de Ayuda EyedComun",
    message:
      "Bienvenido al **centro de soporte** de EyedComun.\n\n" +
      "1. Elige la **categoría** que mejor describa tu caso.\n" +
      "2. Indica el **motivo** en el menú siguiente.\n" +
      "3. Si te lo pedimos, adjunta **capturas**, enlaces o tu **Discord User ID**.\n\n" +
      "**Eyed.bio:** para presencia Discord debes estar en este servidor y tener tu ID configurado.\n" +
      "**Tiempos:** el staff responde según disponibilidad; evita abrir tickets duplicados.",
    buttonLabel: "Abrir ticket de soporte",
    footer: "EyedComun · EyedBot · Eyed.bio",
    ticketCategories: [
      { value: "soporte-general", label: "Soporte general", description: "Dudas sobre el servidor y la comunidad" },
      { value: "eyedbio", label: "Eyed.bio", description: "Perfil link-in-bio, temas y widgets" },
      { value: "eyedbot", label: "EyedBot", description: "Bot, panel web y módulos del servidor" },
      { value: "eyedplus", label: "EyedPlus+", description: "Suscripción premium del panel" },
      { value: "reportes", label: "Reportes", description: "Denuncias, spam o apelaciones" },
      { value: "sugerencias", label: "Sugerencias", description: "Ideas para mejorar el ecosistema" },
      { value: "partnerships", label: "Colaboraciones", description: "Alianzas, creadores o marcas" },
    ],
    commonProblems: [
      { value: "permisos", label: "Permisos o acceso", description: "Canales, roles o verificación" },
      { value: "verificacion", label: "Verificación", description: "Rol de miembro verificado" },
      { value: "errores-del-bot", label: "Error de EyedBot", description: "Comandos o panel no responden" },
      { value: "sanciones", label: "Sanción o apelación", description: "Mute, kick o ban" },
      { value: "otro", label: "Otro motivo", description: "Describe tu caso con detalle" },
    ],
    supportAreas: [
      { value: "no-aplica", label: "No aplica", description: "Consulta no relacionada con Eyed.bio" },
      { value: "perfil-gratis", label: "Plan gratuito", description: "Funciones base del perfil" },
      { value: "perfil-pro", label: "Plan Pro", description: "Suscripción o funciones premium" },
      { value: "discord-presence", label: "Presencia Discord", description: "Widget de estado en el perfil" },
      { value: "vinculacion-oauth", label: "Vincular Discord", description: "OAuth con EyedBot" },
      { value: "custom-domain", label: "Dominio propio", description: "DNS y dominio personalizado" },
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
    id: "eyedbio",
    name: "Eyed.bio",
    description: "Soporte completo para perfiles, widgets Discord, temas y cuenta.",
    color: "00c2a8",
    title: "Soporte Eyed.bio",
    message:
      "¿Problemas con tu perfil en **Eyed.bio**? Estamos para ayudarte.\n\n" +
      "**Incluye en el ticket:**\n" +
      "• Enlace o usuario de tu perfil (`eyedbio.eyedcomun.me/...`)\n" +
      "• Tu **Discord User ID** (si es sobre presencia)\n" +
      "• Capturas del error\n\n" +
      "**Presencia Discord:** debes estar en **EyedComun**, tener el ID en el dashboard y que EyedBot esté operativo.",
    buttonLabel: "Ayuda Eyed.bio",
    footer: "EyedBot · Eyed.bio",
    ticketCategories: [
      { value: "perfil", label: "Mi perfil", description: "Enlaces, bio, botones y estructura" },
      { value: "tema", label: "Tema y diseño", description: "Colores, fondo, fuentes y layout" },
      { value: "discord-widget", label: "Widget Discord", description: "Estado, actividad y Spotify" },
      { value: "cuenta", label: "Cuenta / login", description: "Acceso, correo o recuperación" },
      { value: "dominio", label: "Dominio propio", description: "DNS, SSL y dominio personalizado" },
      { value: "plan-pro", label: "Plan Pro", description: "Suscripción y funciones de pago" },
    ],
    commonProblems: [
      { value: "no-carga", label: "No carga el perfil", description: "Página en blanco o error 404" },
      { value: "enlaces-rotos", label: "Enlaces rotos", description: "URLs que no abren o redirigen mal" },
      { value: "discord-offline", label: "Discord sale offline", description: "Widget sin estado actualizado" },
      { value: "discord-spotify", label: "No muestra Spotify", description: "Actividad de escucha ausente" },
      { value: "vincular-discord", label: "Vincular Discord", description: "OAuth con EyedBot" },
      { value: "pago-pro", label: "Pago / Plan Pro", description: "Cobro o activación de premium" },
      { value: "otro", label: "Otro", description: "Describe tu caso con detalle" },
    ],
    supportAreas: [
      { value: "no-aplica", label: "No aplica", description: "Consulta fuera de Eyed.bio" },
      { value: "perfil-gratis", label: "Plan gratuito", description: "Límites y funciones base" },
      { value: "perfil-pro", label: "Plan Pro", description: "Suscripción y renovación" },
      { value: "enlaces-botones", label: "Enlaces y botones", description: "Iconos, orden y estilos" },
      { value: "tema-visual", label: "Tema visual", description: "Apariencia del perfil" },
      { value: "discord-presence", label: "Presencia Discord", description: "Online, idle, dnd, offline" },
      { value: "spotify-widget", label: "Spotify", description: "Canción y artista en el perfil" },
      { value: "vinculacion-oauth", label: "Vinculación OAuth", description: "Conectar con EyedBot" },
      { value: "custom-domain", label: "Dominio personalizado", description: "DNS y certificados" },
      { value: "analytics", label: "Estadísticas", description: "Visitas y clics en enlaces" },
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
    id: "reports",
    name: "Reportes / Moderación",
    description: "Denuncias detalladas con categorías para el equipo de staff.",
    color: "ed4245",
    title: "Reportes y Denuncias",
    message:
      "Usa este panel solo para **reportes serios**.\n\n" +
      "**Obligatorio incluir:**\n" +
      "• ID del usuario reportado (`@usuario` → clic derecho → Copiar ID)\n" +
      "• Capturas o enlaces a mensajes\n" +
      "• Breve descripción de lo ocurrido\n\n" +
      "Los reportes sin pruebas pueden tardar más en revisarse.",
    buttonLabel: "Enviar reporte",
    footer: "EyedBot · Moderación",
    ticketCategories: [
      { value: "usuario", label: "Reporte de usuario", description: "Conducta inapropiada o toxicidad" },
      { value: "spam", label: "Spam / raid", description: "Mensajes masivos, bots o flooding" },
      { value: "contenido", label: "Contenido prohibido", description: "NSFW, odio, scams o ilegal" },
      { value: "dm-acoso", label: "Acoso en MD", description: "Mensajes privados abusivos" },
      { value: "apelacion", label: "Apelación", description: "Revisión de mute, kick o ban" },
    ],
    commonProblems: [
      { value: "acoso", label: "Acoso o amenazas", description: "Menciones, DMs o persecución" },
      { value: "suplantacion", label: "Suplantación", description: "Fingir ser staff u otra persona" },
      { value: "scam", label: "Estafa / phishing", description: "Enlaces maliciosos o fraudes" },
      { value: "nsfw", label: "Contenido NSFW", description: "Material no permitido en el servidor" },
      { value: "otro", label: "Otro incidente", description: "Describe lo ocurrido" },
    ],
    sendDmReceipt: false,
    sendDmPendingStatus: true,
  },
  {
    id: "staff-apps",
    name: "Postulaciones staff",
    description: "Formulario guiado para candidatos al equipo de moderación.",
    color: "3ba55d",
    title: "Postulaciones Staff",
    message:
      "¿Quieres unirte al **equipo de moderación**?\n\n" +
      "En el ticket incluye:\n" +
      "• Edad aproximada y **zona horaria**\n" +
      "• Experiencia previa como staff (si tienes)\n" +
      "• Por qué quieres ayudar y en qué área\n" +
      "• Disponibilidad semanal\n\n" +
      "Solo revisamos postulaciones **completas**.",
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
    ...(preset.supportAreas?.length
      ? { supportAreas: preset.supportAreas.map((item) => ({ ...item })) }
      : {}),
    sendDmReceipt: preset.sendDmReceipt ?? current.sendDmReceipt,
    sendDmPendingStatus: preset.sendDmPendingStatus ?? current.sendDmPendingStatus,
  };
}
