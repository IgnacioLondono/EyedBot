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

## 3. Variables de entorno del Stack

En la seccion **Environment variables** agrega al menos:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Opcionales recomendadas:

- `TENOR_API_KEY`
- `GEMINI_API_KEY`
- `LAVALINK_ENABLED=true` (si quieres usar lavalink)
- `LAVALINK_PASSWORD` (si cambias la default)

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
- Si musica falla por stream: prueba `LAVALINK_ENABLED=true`
- Si Stack no levanta: revisa logs de `eyedbot` y `eyedbot-lavalink`
