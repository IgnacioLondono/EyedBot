# Portainer + OpenMediaVault (Git Deploy)

Esta guia deja el bot corriendo desde un Stack en Portainer usando este repositorio Git.

## 1. Requisitos en OMV

- Docker y Portainer instalados
- Acceso saliente a Internet
- Permisos de escritura para volumenes persistentes del Stack

## 2. Crear Stack desde Git

1. En Portainer: **Stacks** -> **Add stack**
2. Nombre sugerido: `eyedbot`
3. Build method: **Repository**
4. Repository URL: tu repo (`https://github.com/IgnacioLondono/EyedBot`)
5. Compose path: `docker-compose.yml`
6. Branch: `main`

### Opcion Host mode (evita conflicto MAC/red)

Si quieres usar `network_mode: host`, en Portainer usa este compose del repo:

- Compose path: `docker-compose.host.yml`

Este archivo ya viene preparado sin `mac_address`, sin `ports` y sin `networks` para evitar el error:

- `conflicting options: mac-address and the network mode`

Notas:

- En host mode, para musica en el mismo host, usa `LAVALINK_HOST=127.0.0.1`.
- En host mode, define `DB_HOST` con IP/host real de tu MySQL (por defecto: `127.0.0.1`).
- Si migraste MySQL al host (carpeta tipo `/srv/.../Eyedbot/mysql/`), usa **`docker-compose.host.yml`** y **no** levantes el servicio `mysql` del compose bridge.
- Detrás de **nginx**: `WEB_BIND_HOST=127.0.0.1`, `WEB_PUBLIC_ORIGIN=https://tu-dominio`, `SESSION_COOKIE_SECURE=true`. Ver **`NGINX_OMV.md`** y `docker/nginx/eyedbot.conf`.

## 3. Variables de entorno del Stack

En la seccion **Environment variables** agrega al menos:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `EYEDBOT_API_KEY` (API de presencia + firma OAuth Eyed.bio; genera con `openssl rand -base64 32`)
- `REDIRECT_URI=https://eyedbot.eyedcomun.me/callback` (OAuth Discord, obligatorio para link Eyed.bio)

Opcionales recomendadas:

- `TENOR_API_KEY`
- `GEMINI_API_KEY`
- `COMPOSE_PROFILES=music` (**obligatorio** si quieres música; sin esto no se levanta `eyedbot-lavalink`)
- `MUSIC_ENABLED=true`
- `LAVALINK_ENABLED=true`
- `LAVALINK_HOST=lavalink` (bridge) o `LAVALINK_HOST=127.0.0.1` (**host mode**)
- `LAVALINK_PORT=2333`
- `LAVALINK_PASSWORD=youshallnotpass` (misma clave en **bot** y **lavalink**; Lavalink 4 también usa `LAVALINK_SERVER_PASSWORD`, el compose la sincroniza)

Audio recomendado (perfil limpio/estable):

- `MUSIC_DEFAULT_VOLUME=55`
- `MUSIC_MAX_VOLUME=80`
- `MUSIC_SKIP_FFMPEG=false`
- `MUSIC_CLEAN_PROFILE_ENABLED=true`
- `MUSIC_CLEAN_FILTERS=normalizer2,softlimiter`
- `MUSIC_LEAVE_ON_EMPTY=true`
- `MUSIC_LEAVE_ON_EMPTY_COOLDOWN_MS=90000`
- `MUSIC_LEAVE_ON_END=true`
- `MUSIC_LEAVE_ON_END_COOLDOWN_MS=180000`
- `MUSIC_LEAVE_ON_STOP=true`
- `MUSIC_LEAVE_ON_STOP_COOLDOWN_MS=30000`
- `MUSIC_BUFFERING_TIMEOUT_MS=7000`
- `MUSIC_CONNECTION_TIMEOUT_MS=45000`

## 4. Volumenes persistentes

El stack ya monta:

- `./data` -> `/app/data`
- `./logs` -> `/app/logs`

Esto conserva conteos y logs entre reinicios.

## 5. Deploy

1. Click en **Deploy the stack**
2. Verifica logs en `eyedbot`
3. Debes ver: `EyedBot conectado como ...`

## 6. Actualizaciones por Git

- Haz push a `main`
- En Portainer: **Stacks -> eyedbot -> Pull and redeploy**

### Redeploy más rápido (recomendado en NAS)

El build completo (npm + Next.js) es lo que más tarda. Hay dos modos:

**A) Build optimizado en el NAS (por defecto)**  
Sigue usando `docker-compose.yml` o `docker-compose.host.yml`. El Dockerfile usa capas separadas y caché BuildKit:

- Cambios solo en `src/` → no reinstala dependencias ni recompila el panel.
- Cambios solo en `web/panel/` → no reinstala deps del bot.
- Asegúrate de que Portainer/Docker tenga **BuildKit** activo (`DOCKER_BUILDKIT=1`).

**B) Sin compilar en el NAS (más rápido)**  
GitHub Actions publica la imagen en cada push a `main` (workflow `docker-publish.yml`).

1. En GitHub: **Packages** → `eyedbot` → **Package settings** → visibility **Public** (o token de lectura en Portainer).
2. En Portainer cambia **Compose path** a: `docker-compose.ghcr-host.yml`
3. **Pull and redeploy** ≈ descargar imagen + reiniciar (minutos → segundos en un NAS lento).

Si el repo es privado, crea un PAT con `read:packages` y en Portainer **Registries** → Add registry → `ghcr.io`.

**Forzar build local** (sin GHCR): `docker compose build --no-cache bot && docker compose up -d bot`

## 7. Troubleshooting rapido

- Si no conecta Discord: revisa `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
- Si musica falla por stream: revisa red/salida a YouTube y prueba bajar filtros con `/filters reset`
- Si Stack no levanta: revisa logs de `eyedbot` y `eyedbot-lavalink`

### Lavalink no conecta (`sin nodos en Shoukaku` / `HTTP no respondió`)

1. En Portainer → **Containers**: debe existir **`eyedbot-lavalink`** en estado **running**.
   - Si no existe: añade `COMPOSE_PROFILES=music` en las variables del stack y redeploy.
2. Variables del stack:
   - `MUSIC_ENABLED=true`
   - `LAVALINK_ENABLED=true`
   - `LAVALINK_HOST=127.0.0.1` si usas `docker-compose.host.yml` (host mode)
   - `LAVALINK_PASSWORD` **igual** en bot y lavalink
3. Logs de `eyedbot-lavalink`: busca `Started LavalinkServer` o errores de descarga del plugin YouTube.
   - El **primer arranque** puede tardar 2–3 minutos descargando el plugin.
4. Prueba manual (en el NAS):  
   `curl -H "Authorization: TU_PASSWORD" http://127.0.0.1:2333/version`  
   Debe responder JSON con la versión.
5. Si el contenedor se reinicia en bucle: sube memoria (`_JAVA_OPTIONS=-Xmx768m`) o revisa espacio en disco.

### YouTube / Lavalink: `Permission denied` en `./plugins`

El volumen `./data/lavalink-plugins` en OMV suele ser **solo lectura** para el usuario `lavalink` del contenedor.

**Solución (desde commit reciente):** el plugin `youtube-plugin-1.18.1.jar` va **dentro de la imagen** `eyedbot-lavalink:4`. No montes carpeta en `/opt/Lavalink/plugins`.

1. Pull and redeploy con **rebuild** del servicio `lavalink`.
2. Elimina del compose cualquier volumen `lavalink-plugins` o `./data/lavalink-plugins`.
3. En logs debe aparecer carga del plugin **sin** error `Permission denied`.
4. Prueba: `curl -H "Authorization: TU_PASSWORD" "http://127.0.0.1:2333/v4/loadtracks?identifier=ytsearch:test"`

### YouTube: `requires login` o audio con mala calidad

1. **Rebuild** de `eyedbot-lavalink:4` (la config de clientes va en `docker/lavalink/application.yml`).
2. Clientes recomendados: `ANDROID_VR`, `TVHTML5_SIMPLY`, `MWEB`, `WEBEMBEDDED`, `MUSIC` (solo búsqueda).
3. **No uses** `ANDROID_MUSIC` ni `IOS` en playback: el primero pide login; el segundo no devuelve Opus y suena transcodificado.
4. No definas `PLUGINS_YOUTUBE_CLIENTS_*` en el stack si quieres usar la config del `application.yml` embebido.
5. Si muchos videos fallan, considera OAuth del plugin (cuenta quemable) en `application.yml` → `plugins.youtube.oauth`.

## 8. Tuning del host (OMV/Debian)

Si buscas menor latencia y menos caidas, aplica tuning en el host antes de hacer deploy.

Script incluido:

- `docker/host-tuning-omv.sh`

Que ajusta:

- `sysctl` (swappiness bajo, colas y file descriptors)
- limites `nofile`
- swap persistente (`/swapfile`)
- Docker daemon (`live-restore` + rotacion de logs)

Ejecucion:

```bash
cd /ruta/de/EyedBot-main
sudo bash docker/host-tuning-omv.sh
```

Opcional (no tocar daemon.json):

```bash
sudo APPLY_DOCKER_DAEMON=0 bash docker/host-tuning-omv.sh
```

Despues del tuning:

1. En Portainer, redeploy del stack.
2. Verifica estado `healthy` del contenedor `eyedbot`.
3. Revisa uso de RAM/CPU por 24h y eventos de restart.
