import type { LucideIcon } from "lucide-react";

export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "callout"; variant: "info" | "tip" | "premium" | "warning"; title?: string; text: string }
  | { type: "code"; code: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type DocArticle = {
  slug: string;
  title: string;
  description: string;
  premium?: boolean;
  blocks: DocBlock[];
};

export type DocNavItem = {
  slug: string;
  title: string;
  premium?: boolean;
};

export type DocNavGroup = {
  label: string;
  items: DocNavItem[];
};

export const DOCS_DEFAULT_SLUG = "introduction";

export const DOCS_NAV: DocNavGroup[] = [
  {
    label: "Inicio",
    items: [
      { slug: "introduction", title: "Introducción" },
      { slug: "getting-started", title: "Primeros pasos" },
    ],
  },
  {
    label: "Panel web",
    items: [
      { slug: "panel/overview", title: "Visión general" },
      { slug: "panel/dashboard", title: "Dashboard" },
      { slug: "panel/customization", title: "Personalización", premium: true },
    ],
  },
  {
    label: "Módulos",
    items: [
      { slug: "modules/overview", title: "Resumen de módulos" },
      { slug: "modules/welcome", title: "Bienvenida" },
      { slug: "modules/verify", title: "Verificación" },
      { slug: "modules/tickets", title: "Tickets", premium: true },
      { slug: "modules/levels", title: "Niveles y XP" },
      { slug: "modules/voice", title: "Voz temporal" },
      { slug: "modules/automation", title: "Automatización" },
      { slug: "modules/gacha", title: "Gacha", premium: true },
      { slug: "modules/moderation", title: "Moderación" },
      { slug: "modules/security", title: "Seguridad", premium: true },
      { slug: "modules/notifications", title: "Alertas de directos" },
      { slug: "modules/free-games", title: "Juegos gratis", premium: true },
      { slug: "modules/embed", title: "Constructor de embeds" },
      { slug: "modules/events", title: "Eventos y sorteos" },
      { slug: "modules/weekly-summary", title: "Resumen semanal" },
      { slug: "modules/payments", title: "Pagos" },
    ],
  },
  {
    label: "Referencia",
    items: [
      { slug: "commands", title: "Comandos" },
      { slug: "premium", title: "EyedPlus+" },
      { slug: "faq", title: "Preguntas frecuentes" },
    ],
  },
];

export function docsHref(slug = DOCS_DEFAULT_SLUG) {
  return slug === DOCS_DEFAULT_SLUG ? "/docs" : `/docs/${slug}`;
}

export function flattenDocsNav(): DocNavItem[] {
  return DOCS_NAV.flatMap((g) => g.items);
}

export function findDocArticle(slug: string | undefined): DocArticle | null {
  const key = slug?.trim() || DOCS_DEFAULT_SLUG;
  return DOCS_ARTICLES[key] ?? null;
}

const introBlocks: DocBlock[] = [
  {
    type: "paragraph",
    text: "EyedBot es un bot de Discord con panel web para moderar, automatizar y hacer crecer tu comunidad. Combina comandos slash en Discord con configuración visual: bienvenidas, tickets, niveles, alertas de directos, seguridad, gacha y más.",
  },
  {
    type: "callout",
    variant: "info",
    title: "¿Nuevo aquí?",
    text: "Empieza por Primeros pasos para invitar el bot y configurar tu primer módulo en menos de cinco minutos.",
  },
  {
    type: "heading",
    level: 2,
    text: "¿Qué incluye EyedBot?",
  },
  {
    type: "list",
    items: [
      "Panel web con login de Discord y configuración por servidor.",
      "Módulos independientes que activas según las necesidades de tu comunidad.",
      "Comandos slash organizados por categorías (moderación, niveles, música, diversión…).",
      "EyedPlus+ para funciones avanzadas: tickets pro, gacha, seguridad, temas y más.",
    ],
  },
  {
    type: "heading",
    level: 2,
    text: "Arquitectura",
  },
  {
    type: "paragraph",
    text: "Cada servidor de Discord tiene su propia configuración aislada. Los cambios en el panel se guardan al instante y el bot los aplica sin reiniciar. Algunos módulos (alertas Twitch/YouTube) usan schedulers en segundo plano; otros reaccionan a eventos de Discord en tiempo real.",
  },
];

const gettingStartedBlocks: DocBlock[] = [
  {
    type: "heading",
    level: 2,
    text: "1. Invitar el bot",
  },
  {
    type: "list",
    ordered: true,
    items: [
      "Inicia sesión en el panel con tu cuenta de Discord.",
      "Pulsa «Añadir bot» en la barra superior o en el dashboard.",
      "Selecciona el servidor y concede los permisos recomendados.",
      "Vuelve al dashboard: tu servidor aparecerá en la lista.",
    ],
  },
  {
    type: "heading",
    level: 2,
    text: "2. Configurar lo esencial",
  },
  {
    type: "list",
    ordered: true,
    items: [
      "Abre el servidor → módulo Bienvenida o Verificación.",
      "Elige el canal de destino con el selector (no hace falta copiar IDs).",
      "Guarda y usa el botón de prueba para ver el resultado en Discord.",
    ],
  },
  {
    type: "callout",
    variant: "tip",
    title: "Orden recomendado",
    text: "Bienvenida → Verificación → Niveles → Tickets → Alertas de directos. Así cubres onboarding, seguridad básica y engagement.",
  },
  {
    type: "heading",
    level: 2,
    text: "3. Comandos desde Discord",
  },
  {
    type: "paragraph",
    text: "Escribe / en cualquier canal donde el bot tenga permiso. Usa /help para ver categorías o consulta la sección Comandos de esta documentación.",
  },
  {
    type: "code",
    code: "/streamer añadir plataforma:Twitch usuario:nombre canal:#alertas",
  },
];

function moduleDoc(
  slug: string,
  title: string,
  description: string,
  blocks: DocBlock[],
  premium?: boolean
): DocArticle {
  return { slug, title, description, blocks, premium };
}

export const DOCS_ARTICLES: Record<string, DocArticle> = {
  introduction: {
    slug: "introduction",
    title: "Documentación",
    description: "Todo lo que necesitas para configurar EyedBot y sacar el máximo partido a cada módulo.",
    blocks: introBlocks,
  },
  "getting-started": {
    slug: "getting-started",
    title: "Primeros pasos",
    description: "Invita el bot, entra al panel y configura tu primer módulo.",
    blocks: gettingStartedBlocks,
  },
  "panel/overview": moduleDoc("panel/overview", "Panel web", "Cómo funciona el panel de EyedBot.", [
    { type: "paragraph", text: "El panel es la interfaz principal para administradores. Tras iniciar sesión con Discord solo ves servidores donde tienes permiso de gestión y el bot está presente." },
    { type: "heading", level: 2, text: "Navegación" },
    { type: "list", items: [
      "Sidebar izquierda: dashboard, documentación, comandos, EyedPlus+.",
      "Dentro de un servidor: módulos agrupados (General, Comunidad, Moderación, Pagos).",
      "Barra superior: invitar bot, Discord de soporte, selector de tenant (multi-bot).",
    ]},
    { type: "heading", level: 2, text: "Permisos" },
    { type: "paragraph", text: "Necesitas Manage Guild o ser propietario del servidor. El panel nunca muestra servidores ajenos ni permite editar comunidades sin permiso." },
  ]),
  "panel/dashboard": moduleDoc("panel/dashboard", "Dashboard", "Selección y gestión de servidores.", [
    { type: "paragraph", text: "El dashboard lista todas tus comunidades administrables. Busca por nombre, fija favoritos con el icono de pin y entra al resumen o configuración de cada una." },
    { type: "list", items: [
      "Fijados: servidores que marques para acceso rápido.",
      "Actualizar: recarga la lista y estadísticas desde la API.",
      "Invitar bot: enlace OAuth para añadir EyedBot a más servidores.",
    ]},
  ]),
  "panel/customization": moduleDoc("panel/customization", "Personalización del panel", "Temas, colores y fondo del panel (EyedPlus+).", [
    { type: "callout", variant: "premium", title: "EyedPlus+", text: "La personalización completa del panel requiere EyedPlus+ activo en el servidor o cuenta." },
    { type: "paragraph", text: "En Configuración → Personalización puedes cambiar la paleta de acentos, activar burbujas decorativas, subir wallpaper (imagen o video) y ajustar el blur del velo." },
    { type: "list", items: [
      "Presets: midnight, aurora, ember y más.",
      "Wallpaper: se guarda en IndexedDB del navegador (no en el servidor).",
      "Blur: desactívalo para ver el fondo nítido.",
    ]},
  ], true),
  "modules/overview": moduleDoc("modules/overview", "Módulos del servidor", "Vista general de cada plugin por comunidad.", [
    { type: "paragraph", text: "Cada módulo es independiente: puedes activar solo lo que necesites. La configuración se guarda por guildId." },
    { type: "table", headers: ["Módulo", "Función", "Premium"], rows: [
      ["Resumen", "Estadísticas y actividad", "No"],
      ["Bienvenida", "Mensajes al unirse", "No"],
      ["Verificación", "Captcha / botón de rol", "No"],
      ["Tickets", "Soporte con paneles", "Sí"],
      ["Niveles", "XP, rangos, leaderboard", "No"],
      ["Voz temporal", "Salas de voz dinámicas", "No"],
      ["Automatización", "Auto-roles, respuestas", "No"],
      ["Gacha", "Economía y coleccionables", "Sí"],
      ["Moderación", "Warns, mute, logs", "No"],
      ["Seguridad", "Anti-raid, anti-spam", "Sí"],
      ["Alertas", "Twitch, YouTube, Kick…", "No"],
      ["Juegos gratis", "Epic / Steam feeds", "Sí"],
      ["Embeds", "Constructor visual", "No"],
      ["Eventos", "Sorteos y calendario", "No"],
      ["Resumen semanal", "Digest automático", "No"],
      ["Pagos", "Notificaciones de pago", "No"],
    ]},
  ]),
  "modules/welcome": moduleDoc("modules/welcome", "Bienvenida", "Mensajes de bienvenida y despedida personalizables.", [
    { type: "paragraph", text: "Envía un embed cuando un usuario se une o sale del servidor. Soporta variables, imágenes, color y preview en vivo." },
    { type: "heading", level: 3, text: "Variables comunes" },
    { type: "list", items: ["{user} — mención", "{username} — nombre", "{server} — nombre del servidor", "{memberCount} — total de miembros"] },
    { type: "callout", variant: "tip", text: "Usa «Probar» antes de guardar para ver el embed exacto en el canal elegido." },
  ]),
  "modules/verify": moduleDoc("modules/verify", "Verificación", "Protege tu servidor con verificación por botón o captcha.", [
    { type: "paragraph", text: "Los nuevos miembros deben completar la verificación para obtener un rol y acceder al resto del servidor." },
    { type: "list", items: [
      "Canal de verificación con mensaje embed personalizable.",
      "Rol otorgado al verificar correctamente.",
      "Opcional: expulsar si no verifican en X tiempo.",
    ]},
  ]),
  "modules/tickets": moduleDoc("modules/tickets", "Tickets", "Sistema de soporte con paneles, categorías y gestión.", [
    { type: "callout", variant: "premium", title: "EyedPlus+", text: "Tickets avanzados con gestión desde el panel, historial e informes requiere premium." },
    { type: "paragraph", text: "Publica un panel con botones o select menu. Cada ticket abre un canal privado con el usuario y el staff." },
    { type: "list", items: [
      "Constructor de flujo: categorías, preguntas y plantillas.",
      "Roles de staff por categoría.",
      "Cerrar, reclamar y transcript desde Discord o panel.",
    ]},
  ], true),
  "modules/levels": moduleDoc("modules/levels", "Niveles y XP", "Sistema de experiencia, rangos y recompensas.", [
    { type: "paragraph", text: "Los miembros ganan XP por mensajes y tiempo en voz. Al subir de nivel pueden recibir roles automáticos." },
    { type: "list", items: [
      "Canal de anuncios de nivel con embed personalizable.",
      "/perfil, /nivel, /top para consultar progreso.",
      "Multiplicadores y cooldown anti-spam en el panel.",
    ]},
    { type: "code", code: "/rangos — ver tabla de niveles del servidor" },
  ]),
  "modules/voice": moduleDoc("modules/voice", "Voz temporal", "Salas de voz creadas por usuarios.", [
    { type: "paragraph", text: "Un canal «hub» genera salas temporales al unirse. El dueño puede renombrar, limitar usuarios o hacer la sala privada con comandos /voz*." },
    { type: "list", items: ["Canal generador configurable.", "Eliminación automática cuando quedan vacías.", "Integración con permisos del servidor."] },
  ]),
  "modules/automation": moduleDoc("modules/automation", "Automatización", "Auto-roles, respuestas automáticas y recordatorios.", [
    { type: "paragraph", text: "Configura reglas que el bot ejecuta sin intervención manual: roles al unirse, bump reminders, autoresponders por palabra clave." },
    { type: "list", items: [
      "Auto-rol al entrar o al verificar.",
      "Respuestas automáticas con coincidencia parcial o exacta.",
      "Recordatorios de bump para servidores de listados.",
    ]},
  ]),
  "modules/gacha": moduleDoc("modules/gacha", "Gacha", "Economía, cofres, tienda y minijuegos.", [
    { type: "callout", variant: "premium", title: "EyedPlus+", text: "El módulo gacha completo es premium." },
    { type: "paragraph", text: "Monedas del servidor, cofres, pity, tienda comunitaria y minijuegos (dados, trivia, coinflip)." },
    { type: "list", items: ["/cofre, /impulso, /leyenda — comandos premium de comunidad.", "Panel: catálogo, precios y economía.", "Recompensas por XP y actividad en voz."] },
  ], true),
  "modules/moderation": moduleDoc("modules/moderation", "Moderación", "Herramientas de moderación y sanciones.", [
    { type: "paragraph", text: "Comandos slash para el staff: ban, kick, mute, warn, purge, slowmode, lock/unlock canales." },
    { type: "list", items: [
      "/warn y /warnings — historial de advertencias.",
      "Logs configurables hacia canal de moderación.",
      "Anuncios con /announce y mensajes DM con /dm.",
    ]},
  ]),
  "modules/security": moduleDoc("modules/security", "Seguridad", "Anti-raid, anti-spam y protección avanzada.", [
    { type: "callout", variant: "premium", title: "EyedPlus+", text: "Filtros avanzados y anti-raid reforzado en premium." },
    { type: "paragraph", text: "Detecta oleadas de uniones, cuentas nuevas sospechosas y spam repetitivo. Acciones: kick, ban, mute o alerta al staff." },
    { type: "list", items: ["Umbrales de joins por minuto.", "Filtro de enlaces y menciones masivas.", "Modo cuarentena para cuentas recién creadas."] },
  ], true),
  "modules/notifications": moduleDoc("modules/notifications", "Alertas de directos", "Avisos cuando un streamer entra en vivo.", [
    { type: "paragraph", text: "Monitoriza Twitch, YouTube, Kick, Rumble y TikTok. Publica embeds ricos con título, espectadores, categoría y botón «Ver en…»." },
    { type: "heading", level: 3, text: "Configuración" },
    { type: "list", ordered: true, items: [
      "Panel → Alertas → pestaña Directos: añade fuentes por plataforma.",
      "Elige canal de publicación y texto de mención (@rol o @everyone).",
      "Plantillas de título/descripción con variables {platform}, {name}, {title}, {url}.",
      "Prueba con el botón de test antes de activar.",
    ]},
    { type: "heading", level: 3, text: "Desde Discord" },
    { type: "code", code: "/streamer añadir · /streamer lista · /streamer quitar" },
    { type: "callout", variant: "info", text: "Twitch usa EventSub si hay API keys; si no, fallback GQL/HTML. YouTube usa WebSub o scraping. Kick y Rumble se consultan por API/scraping sin keys." },
  ]),
  "modules/free-games": moduleDoc("modules/free-games", "Juegos gratis", "Feed de ofertas Epic Games y Steam.", [
    { type: "callout", variant: "premium", title: "EyedPlus+", text: "Requiere EyedPlus+." },
    { type: "paragraph", text: "Publica automáticamente en un canal cuando hay juegos gratis o promociones en tiendas configuradas." },
  ], true),
  "modules/embed": moduleDoc("modules/embed", "Constructor de embeds", "Crea y envía embeds desde el panel.", [
    { type: "paragraph", text: "Editor visual con título, descripción, campos, autor, footer, colores e imágenes. Preview en tiempo real y envío a canal seleccionado." },
  ]),
  "modules/events": moduleDoc("modules/events", "Eventos y sorteos", "Calendario, eventos y sorteos con /sorteo y /evento.", [
    { type: "paragraph", text: "Organiza eventos de la comunidad y sorteos con requisitos de participación, duración y ganadores automáticos." },
    { type: "list", items: ["/sorteo — crear sorteo con premio y tiempo.", "/evento — anunciar eventos.", "Panel para historial y configuración."] },
  ]),
  "modules/weekly-summary": moduleDoc("modules/weekly-summary", "Resumen semanal", "Digest automático de actividad.", [
    { type: "paragraph", text: "Cada semana publica un resumen con miembros nuevos, mensajes, actividad en voz y comparativa con la semana anterior." },
    { type: "list", items: ["Día y hora programables.", "Zona horaria configurable.", "Mención opcional de rol."] },
  ]),
  "modules/payments": moduleDoc("modules/payments", "Pagos", "Notificaciones de pagos y recibos.", [
    { type: "paragraph", text: "Registra pagos de la comunidad (donaciones, suscripciones) y notifica en un canal con embed personalizable." },
    { type: "list", items: ["Plantillas de título y footer.", "Canal de notificaciones.", "Historial en el panel."] },
  ]),
  commands: {
    slug: "commands",
    title: "Comandos",
    description: "Referencia de comandos slash disponibles en Discord.",
    blocks: [
      { type: "paragraph", text: "La lista completa se carga dinámicamente desde el bot. Usa el buscador para filtrar por nombre o categoría." },
      { type: "callout", variant: "tip", text: "Los comandos pueden variar si el propietario desactiva categorías en la configuración web." },
    ],
  },
  premium: {
    slug: "premium",
    title: "EyedPlus+",
    description: "Funciones premium y cómo activarlas.",
    blocks: [
      { type: "paragraph", text: "EyedPlus+ desbloquea módulos avanzados y personalización total del panel para tu servidor o cuenta." },
      { type: "heading", level: 2, text: "Incluye" },
      { type: "list", items: [
        "Tickets con gestión completa desde el panel.",
        "Gacha, economía y tienda comunitaria.",
        "Seguridad pro: anti-raid y filtros avanzados.",
        "Juegos gratis (Epic / Steam).",
        "Temas, wallpaper y blur del panel.",
        "Distintivo EyedPlus+ y soporte prioritario.",
      ]},
      { type: "callout", variant: "premium", text: "Consulta /premium en Discord o la página EyedPlus+ del panel para planes y activación." },
    ],
  },
  faq: {
    slug: "faq",
    title: "Preguntas frecuentes",
    description: "Respuestas a dudas comunes.",
    blocks: [
      { type: "heading", level: 3, text: "¿El bot no responde a slash commands?" },
      { type: "paragraph", text: "Espera unos minutos tras invitarlo (registro global). Comprueba que tiene permiso Use Application Commands. En servidores grandes el registro puede tardar." },
      { type: "heading", level: 3, text: "¿Puedo usar el panel sin ser dueño?" },
      { type: "paragraph", text: "Sí, con permiso Administrar servidor o Manage Guild en Discord." },
      { type: "heading", level: 3, text: "¿Las alertas de Twitch necesitan API key?" },
      { type: "paragraph", text: "No obligatorio. Sin keys usa detección por GQL/decapi. Con Twitch EventSub configurado las alertas son más rápidas y fiables." },
      { type: "heading", level: 3, text: "¿Dónde se guarda mi wallpaper?" },
      { type: "paragraph", text: "En el navegador (IndexedDB), no en el servidor del bot. Si cambias de dispositivo, vuelve a subirlo." },
      { type: "heading", level: 3, text: "¿Cómo restauro la web anterior?" },
      { type: "paragraph", text: "Existe un backup en web/panel-backup-2026-09-01 dentro del repositorio del proyecto." },
    ],
  },
};
