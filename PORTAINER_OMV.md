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

## 3. Variables de entorno del Stack

En la seccion **Environment variables** agrega al menos:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Opcionales recomendadas:

- `TENOR_API_KEY`
- `GEMINI_API_KEY`
- `LAVALINK_HOST=lavalink`
- `LAVALINK_PORT=2333`
- `LAVALINK_PASSWORD` (si cambias la default)

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

## 7. Troubleshooting rapido

- Si no conecta Discord: revisa `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
- Si musica falla por stream: revisa red/salida a YouTube y prueba bajar filtros con `/filters reset`
- Si Stack no levanta: revisa logs de `eyedbot` y `eyedbot-lavalink`

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
