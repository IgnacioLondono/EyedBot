const DEFAULT_TICKET_CATEGORIES = [
    { value: 'soporte-general', label: 'Soporte general', description: 'Dudas, ayuda y orientación en el servidor' },
    { value: 'eyedbio', label: 'Eyed.bio', description: 'Perfil link-in-bio, widgets, temas y cuenta' },
    { value: 'eyedbot', label: 'EyedBot', description: 'Comandos, panel web, música o configuración del bot' },
    { value: 'eyedplus', label: 'EyedPlus+', description: 'Suscripción premium del panel y beneficios' },
    { value: 'reportes', label: 'Reportes', description: 'Denuncias, apelaciones y conductas' },
    { value: 'sugerencias', label: 'Sugerencias', description: 'Ideas para la comunidad o plataformas' },
    { value: 'partnerships', label: 'Colaboraciones', description: 'Alianzas, patrocinios o mediación' }
];

const DEFAULT_COMMON_PROBLEMS = [
    { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
    { value: 'verificacion', label: 'Verificación', description: 'Rol de verificado o acceso al servidor' },
    { value: 'sanciones', label: 'Sanción o apelación', description: 'Mute, kick, ban o revisión de sanción' },
    { value: 'errores-del-bot', label: 'Error del bot', description: 'Comandos que fallan o no responden' },
    { value: 'roles-y-canales', label: 'Roles y canales', description: 'Roles incorrectos o accesos faltantes' },
    { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
];

const DEFAULT_COMMON_ISSUES_BY_CATEGORY = {
    'soporte-general': [
        { value: 'orientacion', label: 'Orientación general', description: 'No sé por dónde empezar en el servidor' },
        { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
        { value: 'verificacion', label: 'Verificación', description: 'No recibí rol o no puedo verificar' },
        { value: 'roles-y-canales', label: 'Roles y canales', description: 'Acceso incorrecto a secciones' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    eyedbio: [
        { value: 'perfil-no-carga', label: 'El perfil no carga', description: 'Página en blanco, 404 o error' },
        { value: 'enlaces', label: 'Enlaces o botones', description: 'Links rotos, orden o iconos' },
        { value: 'tema-diseno', label: 'Tema o diseño', description: 'Colores, fondo, tipografía o layout' },
        { value: 'discord-offline', label: 'Discord sale offline', description: 'Widget de presencia no actualiza' },
        { value: 'discord-spotify', label: 'Spotify / actividad', description: 'No muestra lo que escuchas o juegas' },
        { value: 'vincular-discord', label: 'Vincular Discord', description: 'Conectar cuenta con EyedBot' },
        { value: 'dominio', label: 'Dominio personalizado', description: 'DNS, SSL o dominio propio' },
        { value: 'cuenta-login', label: 'Cuenta o login', description: 'Acceso, correo o recuperación' },
        { value: 'plan-pro', label: 'Plan Pro / premium', description: 'Suscripción o funciones de pago' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'solicitud-ingreso-minecraft': [
        { value: 'perfil-no-carga', label: 'El perfil no carga', description: 'Página en blanco, 404 o error' },
        { value: 'discord-offline', label: 'Discord sale offline', description: 'Widget de presencia no actualiza' },
        { value: 'vincular-discord', label: 'Vincular Discord', description: 'Conectar cuenta con EyedBot' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    eyedbot: [
        { value: 'comandos', label: 'Comandos del bot', description: 'Slash, prefijo o permisos de uso' },
        { value: 'panel-web', label: 'Panel web', description: 'Login, configuración o publicación' },
        { value: 'musica', label: 'Música / Lavalink', description: 'Cola, reproducción o desconexiones' },
        { value: 'tickets-modulos', label: 'Tickets u otros módulos', description: 'Welcome, niveles, gacha, etc.' },
        { value: 'eyedplus-panel', label: 'EyedPlus+ en el panel', description: 'Funciones premium del dashboard' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    eyedplus: [
        { value: 'activar-plan', label: 'Activar suscripción', description: 'Pago realizado pero sin acceso' },
        { value: 'cancelar-plan', label: 'Cancelar o cambiar plan', description: 'Baja o cambio de método de pago' },
        { value: 'facturacion', label: 'Facturación / cobro', description: 'Cargo duplicado o monto incorrecto' },
        { value: 'beneficios', label: 'Beneficios premium', description: 'Función Pro que no aparece' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    reportes: [
        { value: 'usuario', label: 'Reportar usuario', description: 'Conducta tóxica, spam o acoso' },
        { value: 'contenido', label: 'Contenido prohibido', description: 'NSFW, odio, scams o ilegal' },
        { value: 'raid-spam', label: 'Raid o spam masivo', description: 'Ataque coordinado o bots' },
        { value: 'apelacion', label: 'Apelación de sanción', description: 'Revisar mute, kick o ban' },
        { value: 'suplantacion', label: 'Suplantación', description: 'Fingir ser staff u otra persona' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    sugerencias: [
        { value: 'mejora-comunidad', label: 'Mejora de comunidad', description: 'Eventos, roles o convivencia' },
        { value: 'mejora-bot', label: 'Mejora de EyedBot', description: 'Comandos, panel o automatización' },
        { value: 'mejora-eyedbio', label: 'Mejora de Eyed.bio', description: 'Funciones de la plataforma link-in-bio' },
        { value: 'nuevo-modulo', label: 'Nuevo módulo o integración', description: 'Ideas de producto o API' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    partnerships: [
        { value: 'creador', label: 'Soy creador de contenido', description: 'Colaboración o visibilidad' },
        { value: 'marca', label: 'Marca o empresa', description: 'Patrocinio o alianza comercial' },
        { value: 'servidor', label: 'Otro servidor Discord', description: 'Partner entre comunidades' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    perfil: [
        { value: 'enlaces', label: 'Enlaces o botones', description: 'URLs, orden o iconos del perfil' },
        { value: 'bio-texto', label: 'Texto o descripción', description: 'Bio, título o secciones' },
        { value: 'no-carga', label: 'No carga el perfil', description: 'Error al abrir la página' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    tema: [
        { value: 'colores', label: 'Colores o contraste', description: 'Paleta, legibilidad o modo oscuro' },
        { value: 'fondo', label: 'Fondo o wallpaper', description: 'Imagen, video o animación' },
        { value: 'fuentes', label: 'Tipografía', description: 'Fuente, tamaño o estilo' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'discord-widget': [
        { value: 'discord-offline', label: 'Sale offline', description: 'Estado no se actualiza' },
        { value: 'discord-spotify', label: 'Spotify / actividad', description: 'No muestra escuchando o jugando' },
        { value: 'vincular-discord', label: 'Vincular Discord', description: 'OAuth o ID incorrecto' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    cuenta: [
        { value: 'login', label: 'No puedo iniciar sesión', description: 'Correo, OAuth o contraseña' },
        { value: 'recuperar', label: 'Recuperar cuenta', description: 'Acceso perdido al perfil' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    dominio: [
        { value: 'dns', label: 'Configuración DNS', description: 'Registros CNAME, A o TXT' },
        { value: 'ssl', label: 'Certificado SSL', description: 'HTTPS o aviso de seguridad' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'plan-pro': [
        { value: 'activar', label: 'Activar Pro', description: 'Pagé pero no tengo funciones' },
        { value: 'cancelar', label: 'Cancelar Pro', description: 'Baja de suscripción' },
        { value: 'factura', label: 'Factura o cobro', description: 'Monto o cargo duplicado' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    comandos: [
        { value: 'slash', label: 'Comandos slash', description: 'No aparecen o fallan' },
        { value: 'permisos-cmd', label: 'Sin permiso', description: 'No puedo usar un comando' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'panel-web': [
        { value: 'oauth', label: 'Login del panel', description: 'Discord OAuth o sesión' },
        { value: 'guardar', label: 'No guarda cambios', description: 'Config que no persiste' },
        { value: 'publicar', label: 'Publicar panel/módulo', description: 'Embed o mensaje no se publica' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    musica: [
        { value: 'no-reproduce', label: 'No reproduce', description: 'Cola vacía o sin audio' },
        { value: 'desconecta', label: 'Se desconecta', description: 'Sale del canal de voz' },
        { value: 'lavalink', label: 'Lavalink / nodo', description: 'Errores del servidor de música' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    modulos: [
        { value: 'tickets', label: 'Tickets', description: 'Panel, categorías o flujo' },
        { value: 'welcome', label: 'Bienvenida', description: 'Mensaje o tarjeta de join' },
        { value: 'niveles', label: 'Niveles / XP', description: 'Ranking o recompensas' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    consulta: [
        { value: 'normas', label: 'Normas del servidor', description: 'Dudas sobre reglas' },
        { value: 'canales', label: '¿Dónde preguntar?', description: 'Orientación de canales' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    tecnico: [
        { value: 'discord-bug', label: 'Fallo de Discord', description: 'Cliente o app de Discord' },
        { value: 'bot-caido', label: 'Bot caído', description: 'EyedBot sin respuesta' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    verificacion: [
        { value: 'sin-rol', label: 'Sin rol verificado', description: 'Completé pasos pero sin acceso' },
        { value: 're-verificar', label: 'Re-verificación', description: 'Perdí el rol tras cambios' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    roles: [
        { value: 'sin-acceso', label: 'Sin acceso a canal', description: 'Rol o permiso faltante' },
        { value: 'rol-incorrecto', label: 'Rol incorrecto', description: 'Tienes un rol que no corresponde' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    compra: [
        { value: 'pago-fallido', label: 'Pago fallido', description: 'Tarjeta rechazada o error' },
        { value: 'sin-confirmacion', label: 'Sin confirmación', description: 'Cobró pero sin email/recibo' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    entrega: [
        { value: 'rol-pendiente', label: 'Rol o producto pendiente', description: 'Aún no recibido' },
        { value: 'retraso', label: 'Retraso largo', description: 'Más tiempo del anunciado' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    reembolso: [
        { value: 'solicitar', label: 'Solicitar reembolso', description: 'Devolución de compra' },
        { value: 'estado', label: 'Estado del reembolso', description: 'Seguimiento de solicitud' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    facturacion: [
        { value: 'duplicado', label: 'Cargo duplicado', description: 'Dos cobros por lo mismo' },
        { value: 'monto', label: 'Monto incorrecto', description: 'Cantidad distinta a la esperada' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    suscripcion: [
        { value: 'renovar', label: 'Renovación', description: 'Problema al renovar plan' },
        { value: 'cancelar', label: 'Cancelar', description: 'Baja de suscripción' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    usuario: [
        { value: 'toxicidad', label: 'Toxicidad', description: 'Insultos o hostigamiento' },
        { value: 'spam-user', label: 'Spam de usuario', description: 'Mensajes repetitivos' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    spam: [
        { value: 'raid', label: 'Raid', description: 'Entrada masiva coordinada' },
        { value: 'bots', label: 'Bots spam', description: 'Cuentas automatizadas' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    contenido: [
        { value: 'nsfw', label: 'NSFW', description: 'Contenido adulto no permitido' },
        { value: 'odio', label: 'Odio o discriminación', description: 'Lenguaje ofensivo grave' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'dm-acoso': [
        { value: 'md-insultos', label: 'Insultos en MD', description: 'Mensajes privados abusivos' },
        { value: 'amenazas', label: 'Amenazas', description: 'Intimidación o extorsión' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    apelacion: [
        { value: 'mute', label: 'Apelar mute', description: 'Silencio temporal' },
        { value: 'ban', label: 'Apelar ban', description: 'Expulsión del servidor' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    moderacion: [
        { value: 'primera-vez', label: 'Primera postulación', description: 'Sin experiencia previa' },
        { value: 'experiencia', label: 'Con experiencia', description: 'Ya fuiste staff' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    soporte: [
        { value: 'tickets', label: 'Atención tickets', description: 'Quiero ayudar en soporte' },
        { value: 'faq', label: 'FAQ y guías', description: 'Documentar y orientar usuarios' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    eventos: [
        { value: 'torneos', label: 'Torneos / competencias', description: 'Organizar eventos competitivos' },
        { value: 'comunidad', label: 'Eventos sociales', description: 'Actividades para la comunidad' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'staff-contenido': [
        { value: 'redes', label: 'Redes sociales', description: 'Anuncios y difusión' },
        { value: 'diseno', label: 'Diseño / arte', description: 'Banners, thumbnails, etc.' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'staff-tecnico': [
        { value: 'bot-config', label: 'Configurar EyedBot', description: 'Ayuda técnica con el bot' },
        { value: 'integraciones', label: 'Integraciones', description: 'APIs, webhooks o bots' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ]
};

const DEFAULT_SUPPORT_AREAS = [
    { value: 'no-aplica', label: 'No aplica', description: 'Mi consulta no es sobre Eyed.bio' },
    { value: 'perfil-gratis', label: 'Plan gratuito', description: 'Funciones básicas del perfil público' },
    { value: 'perfil-pro', label: 'Plan Pro', description: 'Suscripción, pago o renovación' },
    { value: 'enlaces-botones', label: 'Enlaces y botones', description: 'URLs, iconos, orden o estilos' },
    { value: 'tema-visual', label: 'Tema y apariencia', description: 'Colores, fondo, fuentes y layout' },
    { value: 'discord-presence', label: 'Presencia Discord', description: 'Estado online y actividad en el perfil' },
    { value: 'spotify-widget', label: 'Spotify / escuchando', description: 'Música o actividad de listening' },
    { value: 'vinculacion-oauth', label: 'Vinculación OAuth', description: 'Conectar Discord con EyedBot' },
    { value: 'custom-domain', label: 'Dominio personalizado', description: 'DNS, SSL o dominio propio' },
    { value: 'analytics', label: 'Estadísticas / clics', description: 'Métricas o contador de visitas' },
    { value: 'embeds-media', label: 'Embeds y multimedia', description: 'Vídeo, imágenes o tarjetas embebidas' }
];

module.exports = {
    DEFAULT_TICKET_CATEGORIES,
    DEFAULT_COMMON_PROBLEMS,
    DEFAULT_COMMON_ISSUES_BY_CATEGORY,
    DEFAULT_SUPPORT_AREAS
};
