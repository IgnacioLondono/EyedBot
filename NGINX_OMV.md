# Nginx + MySQL externo (OpenMediaVault / Portainer)

Guía para servir **EyedBot** detrás de nginx con la base de datos **fuera del stack Docker** (datos en el host, p. ej. `/srv/.../Eyedbot/mysql/`).

## 1. Stack en Portainer (host mode)

1. **Stacks → eyedbot → Editor**
2. **Compose path:** `docker-compose.host.yml`
3. **Environment variables** (producción con nginx):

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tulabot
DB_PASSWORD=tu_password
DB_NAME=tulabot

WEB_PORT=3000
WEB_BIND_HOST=127.0.0.1
WEB_PUBLIC_ORIGIN=https://eyedcomun.me
REDIRECT_URI=https://eyedcomun.me/callback
SESSION_COOKIE_SECURE=true
ALLOW_INSECURE_LOCAL_ORIGIN=false

DISCORD_TOKEN=...
CLIENT_ID=...
CLIENT_SECRET=...
SESSION_SECRET=...
WEB_OWNER_DISCORD_ID=...
```

4. **Pull and redeploy** (sin contenedor `mysql` en este compose).

> El panel solo escucha en `127.0.0.1:3000`; nginx es quien expone HTTPS al exterior.

## 2. Instalar nginx en el host (OMV)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Copia la plantilla del repo:

```bash
sudo cp /ruta/al/repo/docker/nginx/eyedbot.conf /etc/nginx/sites-available/eyedbot.conf
sudo ln -sf /etc/nginx/sites-available/eyedbot.conf /etc/nginx/sites-enabled/eyedbot.conf
sudo nginx -t && sudo systemctl reload nginx
```

Certificado Let's Encrypt (primera vez):

```bash
sudo certbot --nginx -d eyedcomun.me -d www.eyedcomun.me
```

## 3. Discord Developer Portal

- **OAuth2 → Redirects:** `https://eyedcomun.me/callback`
- Debe coincidir con `REDIRECT_URI` del stack.

## 4. Comprobar

```bash
curl -sI https://eyedcomun.me/health
curl -s http://127.0.0.1:3000/health
docker logs eyedbot --tail 30
```

Debes ver el panel en HTTPS y en logs del bot conexión MySQL OK (`DB_HOST=127.0.0.1`).

## 5. Actualizar código

1. Push a `main` desde tu máquina.
2. Portainer: **Pull and redeploy** del stack `eyedbot`.
3. No hace falta tocar nginx salvo que cambies dominio o puerto.

## Troubleshooting

| Síntoma | Revisar |
|--------|---------|
| 502 Bad Gateway | `docker ps`, bot healthy, `WEB_BIND_HOST=127.0.0.1`, puerto 3000 libre |
| Login OAuth falla | `REDIRECT_URI`, `WEB_PUBLIC_ORIGIN`, redirect en Discord |
| MySQL ECONNREFUSED | MySQL corriendo en host, `DB_HOST=127.0.0.1`, usuario/contraseña |
| Cookies / sesión | `SESSION_COOKIE_SECURE=true` con HTTPS |
