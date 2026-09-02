export type TicketOptionPreset = {
  value: string;
  label: string;
  description: string;
  /** Casos / problemas dentro de esta categoría de título. */
  problems?: TicketOptionPreset[];
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
  /** Categorías de título con casos anidados. */
  ticketCategories: TicketOptionPreset[];
  /** Fallback global si alguna categoría no trae casos propios. */
  commonProblems: TicketOptionPreset[];
  sendDmReceipt?: boolean;
  sendDmPendingStatus?: boolean;
};

function cloneOption(item: TicketOptionPreset): TicketOptionPreset {
  return {
    value: item.value,
    label: item.label,
    description: item.description,
    ...(item.problems?.length
      ? { problems: item.problems.map((p) => ({ ...p })) }
      : {}),
  };
}

/** Plantillas owner: categoría de título → casos dentro. */
export const TICKET_PRESETS: TicketPreset[] = [
  {
    id: "owner-comunidad",
    name: "Comunidad (owner)",
    description: "Categorías de título con casos listos dentro de cada una.",
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
      {
        value: "soporte",
        label: "Soporte general",
        description: "Dudas sobre el servidor y la comunidad",
        problems: [
          { value: "permisos", label: "Permisos o acceso", description: "Canales, roles o verificación" },
          { value: "dudas", label: "Duda general", description: "Pregunta sobre normas o canales" },
          { value: "otro-soporte", label: "Otro", description: "Describe tu caso con detalle" },
        ],
      },
      {
        value: "tecnico",
        label: "Problema técnico",
        description: "Errores, bugs o fallos del bot",
        problems: [
          { value: "errores-bot", label: "Error del bot", description: "Comandos o panel no responden" },
          { value: "lag", label: "Lentitud / fallos", description: "El servidor o el bot va mal" },
          { value: "otro-tecnico", label: "Otro técnico", description: "Adjunta capturas si puedes" },
        ],
      },
      {
        value: "reportes",
        label: "Reportes",
        description: "Denuncias, spam o apelaciones",
        problems: [
          { value: "usuario", label: "Reportar usuario", description: "Incumplimiento de normas" },
          { value: "spam", label: "Spam o scam", description: "Mensajes o enlaces sospechosos" },
          { value: "sanciones", label: "Apelación", description: "Mute, kick o ban" },
        ],
      },
      {
        value: "sugerencias",
        label: "Sugerencias",
        description: "Ideas para mejorar la comunidad",
        problems: [
          { value: "idea-canal", label: "Nuevo canal / rol", description: "Propuesta de estructura" },
          { value: "idea-evento", label: "Evento o actividad", description: "Idea de comunidad" },
          { value: "otra-idea", label: "Otra idea", description: "Cuéntanos con detalle" },
        ],
      },
      {
        value: "colaboraciones",
        label: "Colaboraciones",
        description: "Alianzas, creadores o marcas",
        problems: [
          { value: "partnership", label: "Alianza / partnership", description: "Propuesta formal" },
          { value: "creador", label: "Creador de contenido", description: "Colaboración con creators" },
          { value: "otra-colab", label: "Otra colaboración", description: "Describe la propuesta" },
        ],
      },
    ],
    commonProblems: [],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "support-general",
    name: "Soporte general",
    description: "Consultas, permisos y orientación con casos por categoría.",
    color: "5865f2",
    title: "Centro de Soporte",
    message:
      "¿Necesitas ayuda en el servidor? Pulsa el botón y el staff te atenderá.\n\n" +
      "**Antes de abrir:** revisa las reglas, los canales de información y las preguntas frecuentes.\n" +
      "Incluye capturas si reportas un error técnico.",
    buttonLabel: "Abrir ticket",
    footer: "EyedBot · Soporte",
    ticketCategories: [
      {
        value: "consulta",
        label: "Consulta general",
        description: "Dudas sobre el servidor o normas",
        problems: [
          { value: "normas", label: "Normas", description: "Cómo funciona el servidor" },
          { value: "canales", label: "Canales", description: "Dónde publicar o preguntar" },
          { value: "otro-consulta", label: "Otra consulta", description: "Describe tu duda" },
        ],
      },
      {
        value: "tecnico",
        label: "Problema técnico",
        description: "Errores, bugs o fallos de Discord/bot",
        problems: [
          { value: "bot-caido", label: "El bot no responde", description: "Comandos sin respuesta" },
          { value: "error-discord", label: "Error de Discord", description: "Fallos de la app o cliente" },
          { value: "otro-tecnico", label: "Otro", description: "Adjunta capturas" },
        ],
      },
      {
        value: "verificacion",
        label: "Verificación",
        description: "Acceso, rol verificado o onboarding",
        problems: [
          { value: "sin-rol", label: "No recibí el rol", description: "Verificación pendiente" },
          { value: "acceso", label: "No puedo acceder", description: "Canales bloqueados" },
          { value: "otro-verif", label: "Otro", description: "Explica qué falta" },
        ],
      },
      {
        value: "roles",
        label: "Roles y permisos",
        description: "Canales bloqueados o roles incorrectos",
        problems: [
          { value: "rol-mal", label: "Rol incorrecto", description: "Tengo un rol que no debería" },
          { value: "sin-permiso", label: "Sin permiso", description: "No puedo hablar o ver un canal" },
          { value: "otro-roles", label: "Otro", description: "Describe el problema" },
        ],
      },
      {
        value: "sugerencia",
        label: "Sugerencia",
        description: "Ideas para mejorar la comunidad",
        problems: [
          { value: "mejora", label: "Mejora general", description: "Idea para el servidor" },
          { value: "evento", label: "Evento", description: "Propuesta de actividad" },
          { value: "otra-sug", label: "Otra", description: "Cuéntanos tu idea" },
        ],
      },
    ],
    commonProblems: [],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "eyedbot",
    name: "EyedBot / Panel",
    description: "Soporte del bot y panel con casos por módulo.",
    color: "9b59b6",
    title: "Soporte EyedBot",
    message:
      "¿Necesitas ayuda con **EyedBot** o el **panel web**?\n\n" +
      "Indica el **servidor**, el **módulo** y qué esperabas que ocurriera.\n" +
      "Si es sobre **EyedPlus+**, adjunta comprobante de pago si aplica.",
    buttonLabel: "Soporte EyedBot",
    footer: "EyedBot · Panel",
    ticketCategories: [
      {
        value: "comandos",
        label: "Comandos",
        description: "Slash, prefijo o permisos",
        problems: [
          { value: "no-responde", label: "No responde", description: "Sin respuesta a comandos" },
          { value: "sin-permisos", label: "Sin permisos", description: "El bot no puede actuar" },
          { value: "otro-cmd", label: "Otro", description: "Describe el comando" },
        ],
      },
      {
        value: "panel-web",
        label: "Panel web",
        description: "Login, configuración o publicación",
        problems: [
          { value: "panel-login", label: "No puedo entrar", description: "OAuth o sesión" },
          { value: "config-no-guarda", label: "No guarda", description: "Cambios que no persisten" },
          { value: "otro-panel", label: "Otro", description: "Describe el fallo" },
        ],
      },
      {
        value: "musica",
        label: "Música",
        description: "Reproducción, cola o Lavalink",
        problems: [
          { value: "no-suena", label: "No suena", description: "Sin audio en el canal" },
          { value: "cola", label: "Cola / skip", description: "Problemas con la cola" },
          { value: "otro-musica", label: "Otro", description: "Describe el fallo" },
        ],
      },
      {
        value: "modulos",
        label: "Módulos",
        description: "Tickets, niveles, gacha, welcome, etc.",
        problems: [
          { value: "tickets", label: "Tickets", description: "Panel o flujo de tickets" },
          { value: "niveles", label: "Niveles / XP", description: "Sistema de leveling" },
          { value: "otro-mod", label: "Otro módulo", description: "Indica cuál" },
        ],
      },
      {
        value: "eyedplus",
        label: "EyedPlus+",
        description: "Suscripción y funciones premium",
        problems: [
          { value: "premium", label: "No activo", description: "Pagaste pero sin acceso Pro" },
          { value: "cobro", label: "Cobro / factura", description: "Problema de pago" },
          { value: "otro-plus", label: "Otro", description: "Describe el caso" },
        ],
      },
    ],
    commonProblems: [],
    sendDmReceipt: true,
    sendDmPendingStatus: true,
  },
  {
    id: "shop",
    name: "Tienda / Pagos",
    description: "Compras y suscripciones con casos por categoría.",
    color: "f5a623",
    title: "Soporte de Pagos",
    message:
      "¿Problemas con una **compra** o **suscripción**?\n\n" +
      "Adjunta **comprobante**, ID de pedido, correo de pago y fecha aproximada.\n" +
      "No compartas datos bancarios completos en el ticket.",
    buttonLabel: "Soporte de pagos",
    footer: "EyedBot · Pagos",
    ticketCategories: [
      {
        value: "compra",
        label: "Compra / pago",
        description: "Error al pagar o confirmar",
        problems: [
          { value: "pago-fallido", label: "Pago fallido", description: "No se confirmó el cobro" },
          { value: "cargo-duplicado", label: "Cargo duplicado", description: "Cobro repetido" },
          { value: "otro-compra", label: "Otro", description: "Adjunta comprobante" },
        ],
      },
      {
        value: "entrega",
        label: "Entrega pendiente",
        description: "Producto o rol no recibido",
        problems: [
          { value: "no-llego", label: "No recibí el producto", description: "Entrega retrasada" },
          { value: "producto-incorrecto", label: "Producto incorrecto", description: "Recibiste otra cosa" },
          { value: "otro-entrega", label: "Otro", description: "Describe qué falta" },
        ],
      },
      {
        value: "reembolso",
        label: "Reembolso",
        description: "Devolución o cancelación",
        problems: [
          { value: "pedir-reembolso", label: "Pedir reembolso", description: "Solicitud de devolución" },
          { value: "estado-reembolso", label: "Estado del reembolso", description: "Ya lo pedí y no llega" },
        ],
      },
      {
        value: "suscripcion",
        label: "Suscripción",
        description: "Renovación, baja o cambio de plan",
        problems: [
          { value: "cancelar", label: "Cancelar suscripción", description: "Baja de plan" },
          { value: "renovar", label: "Renovación", description: "Problema al renovar" },
          { value: "otro-sub", label: "Otro", description: "Describe el caso" },
        ],
      },
    ],
    commonProblems: [],
    sendDmReceipt: true,
    sendDmPendingStatus: false,
  },
  {
    id: "staff-apply",
    name: "Postulación staff",
    description: "Áreas de staff con tipo de postulación dentro.",
    color: "2ecc71",
    title: "Postulación al Staff",
    message:
      "¿Quieres formar parte del **staff**?\n\n" +
      "Elige el área, cuéntanos tu experiencia y disponibilidad.\n" +
      "Sé honesto: revisamos cada solicitud con calma.",
    buttonLabel: "Postularme",
    footer: "EyedBot · Staff",
    ticketCategories: [
      {
        value: "moderacion",
        label: "Moderación",
        description: "Chat, reglas y convivencia",
        problems: [
          { value: "primera-vez", label: "Primera vez", description: "Nunca fui staff" },
          { value: "experiencia", label: "Con experiencia", description: "Ya moderé otros servers" },
        ],
      },
      {
        value: "soporte",
        label: "Soporte",
        description: "Atención a usuarios y tickets",
        problems: [
          { value: "primera-vez", label: "Primera vez", description: "Nunca atendí tickets" },
          { value: "experiencia", label: "Con experiencia", description: "Ya di soporte antes" },
        ],
      },
      {
        value: "eventos",
        label: "Eventos",
        description: "Organización de actividades",
        problems: [
          { value: "primera-vez", label: "Primera vez", description: "Quiero aprender" },
          { value: "experiencia", label: "Con experiencia", description: "Ya organicé eventos" },
        ],
      },
      {
        value: "staff-contenido",
        label: "Contenido",
        description: "Redes, anuncios o creatividad",
        problems: [
          { value: "redes", label: "Redes / diseño", description: "Creatividad y posts" },
          { value: "anuncios", label: "Anuncios", description: "Comunicación del server" },
        ],
      },
      {
        value: "staff-tecnico",
        label: "Técnico / bot",
        description: "Ayuda con EyedBot o integraciones",
        problems: [
          { value: "bot", label: "EyedBot", description: "Config y módulos" },
          { value: "integraciones", label: "Integraciones", description: "APIs u otras tools" },
        ],
      },
    ],
    commonProblems: [],
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
    ticketCategories: preset.ticketCategories.map(cloneOption),
    commonProblems: (preset.commonProblems || []).map((item) => ({ ...item })),
    supportAreas: [],
    sendDmReceipt: preset.sendDmReceipt ?? current.sendDmReceipt,
    sendDmPendingStatus: preset.sendDmPendingStatus ?? current.sendDmPendingStatus,
  };
}
