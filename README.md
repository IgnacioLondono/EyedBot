# 🤖 TulaBot - Bot de Discord Profesional

Un bot de Discord completo y profesional con **60+ comandos** que incluye moderación, música, diversión, utilidades e integración con IA (Google Gemini).

## ✨ Características Principales

### 🛡️ Moderación (15 comandos)
- `ban`, `kick`, `mute`, `unmute` - Gestión de miembros
- `warn`, `warnings`, `clearwarns` - Sistema de advertencias
- `clear`, `purge` - Limpieza de mensajes
- `lock`, `unlock`, `slowmode` - Control de canales
- `nick`, `role`, `announce` - Gestión avanzada

### 🎵 Música (12 comandos)
- `play`, `pause`, `resume`, `stop` - Control de reproducción
- `skip`, `queue`, `nowplaying` - Gestión de cola
- `volume`, `shuffle`, `remove`, `loop`, `seek`, `filters` - Opciones avanzadas

### 🎮 Diversión (20 comandos)
- `gif`, `meme`, `8ball`, `coinflip`, `dice` - Entretenimiento
- `hug`, `kiss`, `slap`, `pat`, `punch`, `wink` - Acciones sociales
- `avatar`, `userinfo`, `serverinfo` - Información
- `rate`, `choose`, `poll`, `emojify` - Utilidades divertidas
- `cat`, `dog`, `trivia`, `ascii` - Contenido variado

### ⚙️ Utilidades (10 comandos)
- `help`, `ping`, `stats`, `invite` - Información del bot
- `translate`, `weather`, `remind` - Herramientas útiles
- `urban`, `qrcode`, `color` - Utilidades adicionales

### 🤖 IA con Google Gemini
- `/ai` - Chat con IA usando Google Gemini
- `/ai-clear` - Limpiar historial de conversación
- Soporte para múltiples modelos de Gemini

### 🌐 Panel Web
- Autenticación OAuth2 con Discord
- Envío de embeds personalizados
- Estadísticas del bot en tiempo real
- Logs en vivo
- Gestión de comandos
- Configuración de servidores
- Sistema de moderación

## 🚀 Inicio Rápido

### Opción 1: Docker (Recomendado)

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/tulabot.git
cd tulabot

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 3. Levantar servicios
docker-compose up -d --build

# 4. Ver logs
docker-compose logs -f bot
```

### Opción 2: Instalación Local

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/tulabot.git
cd tulabot

# 2. Instalar dependencias
npm install
cd web && npm install && cd ..

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 4. Iniciar bot
npm start
```

## 📋 Requisitos

- **Node.js** 18.0.0 o superior
- **npm** o **yarn**
- **Docker** y **Docker Compose** (para despliegue con Docker)
- Token de Discord Bot
- (Opcional) API Keys para funciones adicionales:
  - Tenor API (para GIFs)
  - Google Gemini API (para IA)

## ⚙️ Configuración

### 1. Crear Bot en Discord

1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crea una nueva aplicación
3. Ve a "Bot" y crea un bot
4. Copia el token → `DISCORD_TOKEN`
5. Copia el Application ID → `CLIENT_ID`
6. En "OAuth2", copia el Client Secret → `CLIENT_SECRET`
7. Configura OAuth2 Redirect URI: `http://localhost:3000/callback`

### 2. Configurar Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```env
# Discord
DISCORD_TOKEN=tu_token_de_discord
CLIENT_ID=1451017355046948976
GUILD_ID=1428561902086262908

# Opcionales
GEMINI_API_KEY=tu_api_key
TENOR_API_KEY=tu_api_key

# Audio recomendado (perfil limpio y estable)
MUSIC_DEFAULT_VOLUME=55
MUSIC_MAX_VOLUME=80
MUSIC_SKIP_FFMPEG=false
MUSIC_CLEAN_PROFILE_ENABLED=true
MUSIC_CLEAN_FILTERS=normalizer2,softlimiter
MUSIC_LEAVE_ON_EMPTY=true
MUSIC_LEAVE_ON_EMPTY_COOLDOWN_MS=90000
MUSIC_LEAVE_ON_END=true
MUSIC_LEAVE_ON_END_COOLDOWN_MS=180000
MUSIC_BUFFERING_TIMEOUT_MS=7000

# Lavalink (opcional, recomendado para estabilidad)
LAVALINK_ENABLED=false
LAVALINK_HOST=lavalink
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
```

### 4. Activar Lavalink (Opcional, recomendado)

El stack ya incluye un servicio Lavalink en Docker para una migración gradual.

```bash
# Levantar bot + lavalink
docker-compose up -d --build

# Verificar lavalink
docker-compose logs -f lavalink
```

Puedes dejar `LAVALINK_ENABLED=false` hasta terminar la migración de reproducción; el servicio quedará listo sin romper tu flujo actual.

### 3. Registrar Comandos

```bash
npm run deploy
```

## 🐳 Despliegue con Docker

### Estructura de Microservicios

El proyecto incluye el servicio del bot en Docker.

### Comandos Docker

```bash
# Construir y levantar
docker-compose up -d --build

# Ver logs
docker-compose logs -f

# Detener
docker-compose down

# Reiniciar
docker-compose restart
```

### Migrar Datos de JSON a MySQL

Si tienes datos en `data/database.json`:

```bash
docker-compose exec bot node docker/migrate-json-to-mysql.js
```

## 🐋 Despliegue en Portainer

Para desplegar en Portainer, consulta la [Guía Completa de Configuración](CONFIGURACION_COMPLETA.md).

Para OpenMediaVault + Portainer usando despliegue por Git, usa:

- [PORTAINER_OMV.md](PORTAINER_OMV.md)

Pasos rápidos:
1. Sube el proyecto a tu servidor
2. En Portainer, crea un nuevo Stack
3. Usa el archivo `docker-compose.yml`
4. Configura las variables de entorno
5. Deploy

## 📚 Documentación

- **[CONFIGURACION_COMPLETA.md](CONFIGURACION_COMPLETA.md)** - Guía completa de configuración y despliegue
- **[DOCKER.md](DOCKER.md)** - Guía rápida de Docker
- **[PORTAINER_SETUP.md](PORTAINER_SETUP.md)** - Guía específica para Portainer
- **[docker/README.md](docker/README.md)** - Documentación de la base de datos

## 🛠️ Tecnologías Utilizadas

- **discord.js** v14 - Librería de Discord
- **discord-player** - Sistema de música
- **MySQL** - Base de datos
- **Express.js** - Panel web
- **Docker** - Contenedores
- **Google Gemini AI** - Integración de IA
- **Node.js** - Runtime

## 📦 Estructura del Proyecto

```
TulaBot/
├── src/
│   ├── commands/          # Comandos del bot
│   │   ├── moderation/
│   │   ├── music/
│   │   ├── fun/
│   │   ├── utility/
│   │   └── config/
│   ├── events/            # Eventos de Discord
│   ├── cogs/              # Sistemas (música, etc.)
│   ├── utils/             # Utilidades (DB, logger, etc.)
│   └── index.js           # Punto de entrada
├── web/
│   ├── public/            # Frontend del panel
│   └── server.js          # Backend del panel
├── docker/
│   ├── mysql/
│   │   └── init.sql      # Inicialización de MySQL
│   └── migrate-json-to-mysql.js
├── docker-compose.yml     # Configuración Docker
├── Dockerfile             # Imagen del bot
└── README.md
```

## 🔧 Comandos Disponibles

```bash
# Desarrollo
npm start          # Iniciar bot
npm run dev        # Modo desarrollo (auto-reload)

# Utilidades
npm run deploy     # Registrar comandos en Discord
npm run verify-oauth    # Verificar configuración OAuth2
npm run verify-gemini   # Verificar modelos de Gemini

# Docker
docker-compose up -d --build
docker-compose logs -f bot
docker-compose restart
```

## 🔒 Seguridad

- ⚠️ **NUNCA** subas tu archivo `.env` al repositorio
- ⚠️ **NUNCA** compartas tu token de Discord
- ✅ Usa contraseñas seguras para MySQL
- ✅ Configura firewall adecuadamente
- ✅ Usa HTTPS en producción

## 📝 Permisos Recomendados del Bot

- Administrar Mensajes
- Expulsar Miembros
- Banear Miembros
- Gestionar Canales
- Gestionar Roles
- Conectar (para música)
- Hablar (para música)
- Usar Comandos de Aplicación
- Leer Historial de Mensajes

## 🐛 Solución de Problemas

### El bot no se conecta
- Verifica que `DISCORD_TOKEN` sea correcto
- Revisa los logs: `docker-compose logs bot`

### Error de MySQL
- Verifica que MySQL esté corriendo
- Verifica las variables `DB_*` en `.env`
- En Docker, usa `DB_HOST=mysql` (no `localhost`)

### Panel web no carga
- Verifica que el puerto 3000 esté abierto
- Verifica `CLIENT_SECRET` y `REDIRECT_URI`
- Revisa los logs: `docker-compose logs web`

Para más ayuda, consulta [CONFIGURACION_COMPLETA.md](CONFIGURACION_COMPLETA.md).

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Siéntete libre de:
1. Hacer un Fork
2. Crear una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abrir un Pull Request

## 📄 Licencia

MIT License - Siéntete libre de usar y modificar este bot.

## 🙏 Agradecimientos

- [discord.js](https://discord.js.org/) - Librería de Discord
- [discord-player](https://github.com/Androz2091/discord-player) - Sistema de música
- [Google Gemini](https://ai.google.dev/) - API de IA

## 📞 Soporte

Si tienes problemas:
1. Revisa la [documentación completa](CONFIGURACION_COMPLETA.md)
2. Verifica los logs
3. Consulta los issues existentes
4. Abre un nuevo issue si es necesario

---

**¡Disfruta de tu bot profesional de Discord!** 🎉
